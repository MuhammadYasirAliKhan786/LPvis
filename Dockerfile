FROM ubuntu:18.04

# install OS dependency packages
RUN apt-get update && \
  apt-get install -y \
    python3 \
    python3-pip \
    python3-gdal \
    gdal-bin && \
  apt-get autoremove -y && \
  apt-get clean && \
  rm -rf /var/lib/apt/lists/partial/* /tmp/* /var/tmp/*

ENV LC_ALL=C.UTF-8
ENV LANG=C.UTF-8

ADD requirements.txt .
RUN pip3 install -r requirements.txt

WORKDIR /home/LPVis

# copy LPVis
COPY dependencies/. src/static/dependencies/.
COPY geodata/. src/static/geodata/.
COPY media/. src/static/media/.
COPY util/. src/static/util/.
COPY main.js src/static/main.js
COPY timestacks.js src/static/timestacks.js
COPY style.css src/static/style.css
COPY index.html src/static/index.html

# copy backend
ENV FLASK_APP src/app.py
COPY src/. src/.

CMD ["flask", "run", "--host=0.0.0.0"]