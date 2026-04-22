import sys
from pathlib import Path

from PIL import Image, ImageOps


TARGET_SIZE = (1280, 800)


def resize_image(source_path: Path, output_path: Path) -> None:
    with Image.open(source_path) as source_image:
        rgb_image = source_image.convert("RGB")
        fitted_image = ImageOps.contain(
            rgb_image,
            TARGET_SIZE,
            method=Image.Resampling.LANCZOS,
        )

        background = rgb_image.resize((1, 1)).getpixel((0, 0))
        canvas = Image.new("RGB", TARGET_SIZE, background)

        offset_x = (TARGET_SIZE[0] - fitted_image.width) // 2
        offset_y = (TARGET_SIZE[1] - fitted_image.height) // 2
        canvas.paste(fitted_image, (offset_x, offset_y))
        canvas.save(output_path, format="PNG")


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("Usage: resize_screenshot.py SOURCE.png OUTPUT.png")

    resize_image(Path(sys.argv[1]), Path(sys.argv[2]))


if __name__ == "__main__":
    main()