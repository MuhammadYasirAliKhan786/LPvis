# Project

This is a **fork** of the 

LPvis 🕺
> Pronounce: "Elpvis" | FOSS Webapp for LPIS declaration conformity assessment and validation of ML classification results

[demo project](https://github.com/EOX-A/LPvis) with the goal to extend the capabilities of the (UI only) prototype with concrete backend functionality:

- connect to [Euro Data Cube Sentinel-Hub Service](https://hub.eox.at/marketplace?group=Euro%20Data%20Cube) to retrieve NDVI timestacks for a concrete LPIS parcel

- use a trained Crop-Type classification ML (details to follow) to visualize "declaration" vs "classification result" for LPIS parcels

## Prerequisites

- LPIS/IACS data - i.e. agricultural parcel boundaries as well as farmer crop type declararation - are ingested in Euro Data Cube - geoDB vector databases: this has been done for Austria 2016, 2017, 2018

- Euro Data Cube - geoDB data is exposed as vector tile layer: we decided to export static vector tiles from geoDB and bundle them together with the application for this demo, uploading these files to S3 or syncing geoDB to PostGIS to be [served directly](https://info.crunchydata.com/blog/dynamic-vector-tiles-from-postgis) would be more scalable options

- a validated dataset of farmer declarations of 2018 is used to train a Crop-Type classification ML on a sample region, this model is applied to a larger region and stored back in Euro Data Cube - geoDB

note: the trained ML model uses Crop-Type groups (like `Sommergetreide`) and not concrete Crop-Types (like `ZuckerMais`, `Hirse`), a mapping table was used for traffic light visualization (e.g. `green` = farmers Crop-Type declaration matches predecited Crop-Type group with prediction model accuracy > 95%)

## Important

The current backend implementation requires as connection with a PostGis database for the LPIS vector data set (demo uses a database instance populated with open government data of Austria) and a Sentinel Hub subscription for NDVI timestacks!
