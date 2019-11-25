# Project

This is a **fork** of the 

LPvis 🕺
> Pronounce: "Elpvis" | FOSS Webapp for LPIS declaration conformity assessment and validation of ML classification results

[demo project](https://github.com/EOX-A/LPvis) with the goal to extend the capabilities of the (UI only) prototype with concrete backend functionality:

- connect to [Euro Data Cube Sentinel-Hub Service](https://hub.eox.at/marketplace?group=Euro%20Data%20Cube) to retrieve NDVI timestacks for a concrete LPIS parcel

- use a trained Crop-Type classification ML (details to follow) to visualize "declaration" vs "classification result" for LPIS parcels

## Important

The current backend implementation requires as connection with a PostGis database for the LPIS vector data set (demo uses a database instance populated with open government data of Austria) and a Sentinel Hub subscription for NDVI timestacks!
