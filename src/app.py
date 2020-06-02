import json
import os
import logging
import logging.config
import oauthlib.oauth2
import requests_oauthlib
import requests

from . import VERSION
from flask import Flask, escape, request, jsonify, json, Response
from prometheus_flask_exporter import PrometheusMetrics
from xcube_geodb.core.geodb import GeoDBClient
import geopandas as gpd
import pandas as pd
import multiprocessing as mp

app = Flask(__name__, static_url_path='')
geodb = GeoDBClient()

metrics = PrometheusMetrics(app)

metrics.info('app_info', 'Application info', version=VERSION)

logger = logging.getLogger(__name__)

logging.config.dictConfig({
    'version': 1,
    'formatters': {
        'simple': {
            'format': '%(levelname)s: %(message)s',
        },
        'verbose': {
            'format': '[%(asctime)s][%(module)s] %(levelname)s: %(message)s',
        }
    },
    'handlers': {
        'console': {
            'level': 'DEBUG',
            # 'filters': ['require_debug_true'],
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        }
    },
    'loggers': {
        'requests': {
            'handlers': ['console'],
            'level': 'DEBUG',
            'propagate': False,
        },
        __name__: {
            'handlers': ['console'],
            'level': 'DEBUG',
            'propagate': False,
        },
        'oauthlib': {
            'handlers': ['console'],
            'level': 'DEBUG',
            'propagate': False,
        },
        'requests_oauthlib': {
            'handlers': ['console'],
            'level': 'DEBUG',
            'propagate': False,
        },
    }
})

os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'

client_id = os.environ.get('SH_CLIENT_ID')
client_secret = os.environ.get('SH_CLIENT_SECRET')
db_modelId = os.environ.get('GEODB_MODEL_ID')

client = oauthlib.oauth2.BackendApplicationClient(client_id=client_id)
session = requests_oauthlib.OAuth2Session(client=client)

oauth2_url = 'https://services.sentinel-hub.com/oauth'
instances_url = 'https://services.sentinel-hub.com/configuration/v1/wms/instances'
fis_url_template = 'https://services.sentinel-hub.com/ogc/fis/{instance_id}'
INSTANCE_ID = None


def checkIds(parcel_ids):
    # coerce IDS to integers and create a list
    if isinstance(parcel_ids, int):
        return str(parcel_ids)
    return [str(int(i))for i in parcel_ids]


def refresh_token(session):
    print('refreshing auth token')
    token_url = oauth2_url + '/token'
    return session.fetch_token(
        token_url=token_url,
        client_id=client_id,
        client_secret=client_secret
    )


def get_instance_id(session):
    print('fetching instance ID')

    response = session.get(instances_url)
    if not response.ok:
        raise Exception('Failed to get instance ID, error was %s' %
                        response.content)
    instances = response.json()
    instance = None
    for instance in instances:
        if instance['name'] == 'Full WMS':
            break
    else:
        raise Exception('No suitable WMS instance found')
    return instance['id']


@app.route('/timestacks')
def get_timestack():
    global INSTANCE_ID
    wkt = None
    try:
        pd_fr = geodb.get_collection(
            collection='lpis_at',
            query="raba_pid=eq.%s&d_od.gte.2018-01-01&d_od.lte.2018-12-31" % int(request.args['parcel_id']),
            database='geodb_a659367d-04c2-44ff-8563-cb488da309e4'
        )
        logger.debug('Received data.')
        wkt = pd_fr.iloc[0].geometry.wkt
    except Exception as e:
        return Response(
            json.dumps({
                'error': str(e)
            }),
            content_type='application/json',
            status=404
        )
    try:
        if not INSTANCE_ID:
            refresh_token(session)
            INSTANCE_ID = get_instance_id(session)
    except Exception as e:
        return Response(
            json.dumps({
                'error': str(e)
            }),
            content_type='application/json',
            status=500
        )

    headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    }

    date_start = request.args.get('date_start', '2018-03-15')
    date_end = request.args.get('date_end', '2018-10-15')
    body = {
        'layer': 'NDVI',
        'crs': 'CRS:84',
        'time': "%s/%s" % (date_start, date_end),
        'resolution': '10m',
        'geometry': wkt,
        # 'bins': 10,
        'type': 'EQUALFREQUENCY',
        'maxcc': request.args.get('maxcc', 10)
    }

    print(headers, body)
    print('Fetching timestack from cloud...')

    return jsonify(
        requests.post(
            fis_url_template.format(instance_id=INSTANCE_ID),
            headers=headers,
            json=body
        ).json()
    )


def fetch_predictions(client, model_id, parcel_ids):
    gp_df = client.get_collection(
        collection='classification_at',
        query="model_id.eq.%s&parcel_id=in.(%s)" % (model_id, ",".join(parcel_ids)),
        database='geodb_a659367d-04c2-44ff-8563-cb488da309e4'
    )
    return gp_df


@app.route('/predictions', methods=['GET', 'POST'])
def predictions():
    parcel_ids = {}
    results_response = {'null': None}
    if request.method == 'GET':
        parcel_ids = request.args['parcel_ids']
    elif request.method == 'POST':
        if not request.content_type == 'application/json':
            return Response('Content-type must be application/json', status=400, mimetype='application/json')
        try:
            parcel_ids = request.json['parcel_ids']
        except KeyError:
            return Response('No "parcel_ids" attribute found', status=400, mimetype='application/json')
    if (not parcel_ids):
        return Response('"parcel_ids" attribute value is empty', status=400, mimetype='application/json')
    try:
        ids = checkIds(parcel_ids)
        pds = []
        # chunk size set to 300 so it does not exceed the characters limit in postgrest api request
        chunks = [ids[x:x + 300] for x in range(0, len(ids), 300)]
        starmap_input = [[geodb, db_modelId, chunk] for chunk in chunks]
        with mp.Pool(6) as pool:
            results = pool.starmap(fetch_predictions, starmap_input)
        rdf = gpd.GeoDataFrame(pd.concat(results, ignore_index=True))
        logger.debug('Received data.')
        # return parcel_id and top three predictions
        results_response = [
            {
                'parcel_id': row.parcel_id,
                'classification_results': [
                    json.loads(row.prediction.replace("'", '"'))[0],
                    json.loads(row.prediction.replace("'", '"'))[1],
                    json.loads(row.prediction.replace("'", '"'))[2]
                ]
            } for row in rdf.itertuples()
        ]
        return jsonify(results_response)

    except Exception as e:
        logger.exception(e)
        return Response(
            json.dumps({
                'error': str(e)
            }),
            content_type='application/json',
            status=404
        )
    finally:
        logger.debug('Connection closed.')
    return jsonify(results_response)


@app.route('/version')
def get_version():
    return Response(response=f"{VERSION}")


@app.route('/headers')
def get_headers():
    return jsonify(dict(request.headers))


@app.route('/')
def get_home():
    return app.send_static_file('index.html')
