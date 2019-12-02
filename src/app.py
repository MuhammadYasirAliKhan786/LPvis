import json
import os
import logging
import logging.config
import oauthlib.oauth2
import requests_oauthlib
import json
import os
import psycopg2
import requests
import oauthlib.oauth2
import requests_oauthlib

from . import VERSION
from flask import Flask, escape, request, jsonify, json, Response
from os.path import dirname, join
from prometheus_flask_exporter import PrometheusMetrics

app = Flask(__name__, static_url_path='')

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

db_host = os.environ.get('DB_HOST')
db_database = os.environ.get('DB_DATABASE')
db_port = int(os.environ.get('DB_PORT', 5432))
db_user = os.environ.get('DB_USER')
db_password = os.environ.get('DB_PASSWORD')

client_id = os.environ.get('SH_CLIENT_ID')
client_secret = os.environ.get('SH_CLIENT_SECRET')

client = oauthlib.oauth2.BackendApplicationClient(client_id=client_id)
session = requests_oauthlib.OAuth2Session(client=client)

oauth2_url = 'https://services.sentinel-hub.com/oauth'
instances_url = 'https://services.sentinel-hub.com/configuration/v1/wms/instances'
fis_url_template = 'https://services.sentinel-hub.com/ogc/fis/{instance_id}'
INSTANCE_ID = None


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
    conn = psycopg2.connect(host=db_host,
                            database=db_database,
                            port=db_port,
                            user=db_user,
                            password=db_password)
    cur = conn.cursor()

    print('Connection started.')

    cur.execute("SELECT ST_AsText(ST_Transform(geometry, 4326)) FROM lpis_at WHERE raba_pid=%(parcel_id)s", {
        'parcel_id': request.args['parcel_id']
    })

    try:
        wkt = cur.fetchall()[0][0]
        print(wkt)
    except IndexError:
        return Response(
            json.dumps({
                'error': 'no such parcel'
            }),
            content_type='application/json',
            status=404
        )
    finally:
        conn.close()
        print('Connection closed.')

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
        'time': f'{date_start}/{date_end}',
        'resolution': '10m',
        'geometry': wkt,
        'bins': 10,
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


MOCK_CLASSIFICATION_RESULTS = [
    {
        "crop_id": 110,
        "probability": 0.98
    },
    {
        "crop_id": 111,
        "probability": 0.01
    },
    {
        "crop_id": 112,
        "probability": 0.01
    },
]


@app.route('/predictions')
def predictions():
    # conn = psycopg2.connect(host=db_host,
    #                         database=db_database,
    #                         port=db_port,
    #                         user=db_user,
    #                         password=db_password)
    # cur = conn.cursor()

    # print('Connection started.')

    # cur.execute("SELECT ST_AsText(ST_Transform(geometry, 4326)) FROM lpis_at WHERE raba_pid=%(parcel_id)s", {
    #     'parcel_id': request.args['parcel_id']
    # })

    # try:
    #     wkt = cur.fetchall()[0][0]
    #     print(wkt)
    # except IndexError:
    #     return Response(
    #         json.dumps({
    #             'error': 'no such parcel'
    #         }),
    #         content_type='application/json',
    #         status=404
    #     )
    # finally:
    #     conn.close()
    #     print('Connection closed.')

    parcel_ids = request.args['parcel_ids']

    return jsonify({
        parcel_id: MOCK_CLASSIFICATION_RESULTS
        for parcel_id in parcel_ids
    })


@app.route('/version')
def get_version():
    return Response(response=f"{VERSION}")


@app.route('/headers')
def get_headers():
    return jsonify(dict(request.headers))


@app.route('/')
def get_home():
    return app.send_static_file('index.html')
