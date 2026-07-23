"""NHC GIS shapefile-zip to GeoJSON conversion for Gulf Watch.

Converts an NHC GIS product zip (as downloaded from nhc.noaa.gov/gis/... or
storm_graphics/api/..._latest.zip) into a GeoJSON FeatureCollection.

NHC's advisory "5day" package zips commonly bundle multiple shapefile layers
together in one archive -- e.g. Bertha's al022026_5day_014A.zip contains a
cone polygon (*_pgn), a forecast track line (*_lin), forecast track points
(*_pts), and watch/warning lines (*_ww_wwlin), all in one zip. zip_to_geojson
merges every shapefile found in the zip into a single FeatureCollection,
tagging each feature's properties with the source shapefile's basename
(property "shapefile") so downstream code can select the layer it needs
(e.g. features whose "shapefile" ends with "_pgn" are the cone polygon).

Pure pyshp: reads shp/dbf/shx triplets from in-memory BytesIO buffers
extracted from the zip -- no temp files, no network I/O.
"""

from __future__ import annotations

import io
import zipfile

import shapefile


def zip_to_geojson(zip_bytes: bytes) -> dict:
    """Convert an NHC GIS shapefile zip (bytes) into a GeoJSON FeatureCollection.

    Finds every .shp file in the zip, pairs it with its .dbf/.shx siblings
    (matched by basename), and merges all of their records into one
    FeatureCollection. Each feature's properties include a "shapefile" key
    holding the source basename (without extension) in addition to that
    shapefile's own record fields. Handles POINT, POLYLINE, and POLYGON shape
    types via pyshp's __geo_interface__, which takes care of multi-part
    geometries (MultiPoint/MultiLineString/MultiPolygon) automatically.

    A .shp file missing its .dbf or .shx sibling in the zip is skipped
    (incomplete triplet -- can't be read).
    """
    archive = zipfile.ZipFile(io.BytesIO(zip_bytes))
    names = set(archive.namelist())
    bases = sorted({n[:-4] for n in names if n.lower().endswith(".shp")})

    features = []
    for base in bases:
        shp_name, dbf_name, shx_name = base + ".shp", base + ".dbf", base + ".shx"
        if dbf_name not in names or shx_name not in names:
            continue

        reader = shapefile.Reader(
            shp=io.BytesIO(archive.read(shp_name)),
            dbf=io.BytesIO(archive.read(dbf_name)),
            shx=io.BytesIO(archive.read(shx_name)),
        )
        source = base.rsplit("/", 1)[-1]  # basename only, in case of a folder prefix
        for shape_record in reader.shapeRecords():
            feature = shape_record.__geo_interface__
            feature["properties"] = {"shapefile": source, **feature["properties"]}
            features.append(feature)

    return {"type": "FeatureCollection", "features": features}
