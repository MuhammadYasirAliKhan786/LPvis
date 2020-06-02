FROM ubuntu:18.04

# install OS dependency packages
RUN apt-get update && \
  apt-get install -y curl && \
  apt-get autoremove -y && \
  apt-get clean && \
  rm -rf /var/lib/apt/lists/partial/* /tmp/* /var/tmp/*

ENV LC_ALL=C.UTF-8
ENV LANG=C.UTF-8

RUN curl -LO http://repo.continuum.io/miniconda/Miniconda3-latest-Linux-x86_64.sh
RUN bash Miniconda3-latest-Linux-x86_64.sh -p /miniconda -b
RUN rm Miniconda3-latest-Linux-x86_64.sh
ENV PATH=/miniconda/bin:${PATH}
RUN conda update -y conda
RUN conda config --add channels conda-forge

RUN conda install --freeze-installed xcube_geodb==0.1.6
RUN conda install requests requests-oauthlib flask oauthlib

RUN conda install pip \
  && conda clean -afy \
  && find /miniconda/ -follow -type f -name '*.a' -delete \
  && find /miniconda/ -follow -type f -name '*.js.map' -delete \
  && find /miniconda/lib/python*/site-packages/bokeh/server/static -follow -type f -name '*.js' ! -name '*.min.js' -delete

RUN pip install prometheus-flask-exporter==0.9.1

WORKDIR /home/LPVis
COPY tiles/. src/static/tiles/.
# uncompress tiles if in gz format
RUN for g in src/static/tiles/*.gz; do tar xzf $g -C src/static/tiles/; rm $g;done

# copy LPVis
COPY dependencies/. src/static/dependencies/.
COPY geodata/. src/static/geodata/.
COPY media/. src/static/media/.
COPY util/. src/static/util/.
COPY main.js src/static/main.js
COPY timestacks.js src/static/timestacks.js
COPY utils.js src/static/utils.js
COPY style.css src/static/style.css
COPY index.html src/static/index.html

# copy backend
ENV FLASK_APP src/app.py
COPY src/. src/.

CMD ["flask", "run", "--host=0.0.0.0"]