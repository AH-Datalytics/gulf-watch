"""Build a georeferenced Gulf overlay from a NOAA GOES ABI MCMIPC file.

The output is a WebP image reprojected to Web Mercator over a caller-supplied
longitude/latitude bounding box. It is therefore safe to use as a MapLibre
image source; no hand-aligned or visually estimated coordinates are involved.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from pyproj import Transformer
from rasterio.enums import Resampling
from rasterio.transform import from_bounds
from rasterio.warp import reproject


def read_band(
    dataset_path: Path,
    band: str,
    destination_shape: tuple[int, int],
    destination_transform: rasterio.Affine,
) -> np.ndarray:
    subdataset = f"netcdf:{dataset_path}:{band}"
    with rasterio.open(subdataset) as source:
        raw = source.read(1).astype("float32")
        nodata = source.nodata
        if nodata is not None:
            raw[raw == nodata] = np.nan
        scale = source.scales[0] if source.scales else 1.0
        offset = source.offsets[0] if source.offsets else 0.0
        reflectance = raw * scale + offset
        destination = np.full(destination_shape, np.nan, dtype="float32")
        reproject(
            reflectance,
            destination,
            src_transform=source.transform,
            src_crs=source.crs,
            src_nodata=np.nan,
            dst_transform=destination_transform,
            dst_crs="EPSG:3857",
            dst_nodata=np.nan,
            resampling=Resampling.bilinear,
        )
        return destination


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--bounds", nargs=4, type=float, metavar=("WEST", "SOUTH", "EAST", "NORTH"), required=True)
    parser.add_argument("--width", type=int, default=1600)
    parser.add_argument("--height", type=int, default=1100)
    parser.add_argument(
        "--infrared",
        action="store_true",
        help="Render the ABI 10.3 µm thermal band for nighttime scenes.",
    )
    args = parser.parse_args()

    west, south, east, north = args.bounds
    to_mercator = Transformer.from_crs("EPSG:4326", "EPSG:3857", always_xy=True)
    left, bottom = to_mercator.transform(west, south)
    right, top = to_mercator.transform(east, north)
    transform = from_bounds(left, bottom, right, top, args.width, args.height)
    shape = (args.height, args.width)

    if args.infrared:
        brightness_temperature = read_band(args.input, "CMI_C13", shape, transform)
        valid = np.isfinite(brightness_temperature)
        # Standard clean-IR treatment: colder, higher cloud tops are brighter;
        # warm water/land remain dark. This keeps overnight replay frames
        # meteorologically useful when visible-band true color is black.
        cloud = np.clip((300 - np.nan_to_num(brightness_temperature, nan=300)) / 105, 0, 1)
        cloud = np.power(cloud, 0.82)
        red = 0.05 + 0.95 * cloud
        green = 0.09 + 0.91 * cloud
        blue = 0.14 + 0.86 * cloud
        rgba = np.dstack((red, green, blue, valid.astype("float32")))
    else:
        blue = read_band(args.input, "CMI_C01", shape, transform)
        red = read_band(args.input, "CMI_C02", shape, transform)
        veggie = read_band(args.input, "CMI_C03", shape, transform)

        valid = np.isfinite(red) & np.isfinite(blue) & np.isfinite(veggie)
        red = np.power(np.clip(np.nan_to_num(red), 0, 1), 1 / 2.2)
        blue = np.power(np.clip(np.nan_to_num(blue), 0, 1), 1 / 2.2)
        veggie = np.power(np.clip(np.nan_to_num(veggie), 0, 1), 1 / 2.2)
        green = np.clip(0.45 * red + 0.10 * veggie + 0.45 * blue, 0, 1)
        rgba = np.dstack((red, green, blue, valid.astype("float32")))
    image = Image.fromarray(np.round(rgba * 255).astype("uint8"), "RGBA")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    image.save(args.output, "WEBP", quality=86, method=6)


if __name__ == "__main__":
    main()
