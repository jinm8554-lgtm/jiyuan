#!/usr/bin/env python3
"""《裂隙纪元》美术资源压缩脚本

将原始生成的大图转换为适合 Web 的尺寸与体积：
  - 立绘：640x960（2:3），另生成 160x160 头像
  - 全景横幅：2560x1097
  - 场景图：1600x1067
输出到 .optimized/ 目录，再通过 manus-upload-file 上传。
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path("/home/ubuntu/webdev-static-assets")
OUT = ROOT / "optimized"
PORTRAITS = sorted((ROOT / "portraits").glob("*.png"))
SCENES = sorted((ROOT / "scenes").glob("*.png"))


def save_jpeg(image: Image.Image, path: Path, quality: int = 86) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.convert("RGB").save(path, "JPEG", quality=quality, optimize=True, progressive=True)


def fit(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    return image.resize(size, Image.LANCZOS)


def center_crop(image: Image.Image, ratio: float) -> Image.Image:
    w, h = image.size
    target_h = int(w / ratio)
    if target_h <= h:
        top = (h - target_h) // 2
        return image.crop((0, top, w, top + target_h))
    target_w = int(h * ratio)
    left = (w - target_w) // 2
    return image.crop((left, 0, left + target_w, h))


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    total_before = 0
    total_after = 0

    for path in PORTRAITS:
        key = path.stem
        with Image.open(path) as img:
            total_before += path.stat().st_size
            portrait = fit(center_crop(img, 2 / 3), (600, 900))
            save_jpeg(portrait, OUT / "portraits" / f"{key}.jpg", 84)
            total_after += (OUT / "portraits" / f"{key}.jpg").stat().st_size

            head = img.crop((0, 0, img.width, int(img.width * 1.0)))
            avatar = fit(head, (160, 160)).filter(ImageFilter.SMOOTH)
            save_jpeg(avatar, OUT / "avatars" / f"{key}.jpg", 86)
            total_after += (OUT / "avatars" / f"{key}.jpg").stat().st_size

    for path in SCENES:
        key = path.stem
        with Image.open(path) as img:
            total_before += path.stat().st_size
            if key == "keep_banner":
                target = fit(center_crop(img, 21 / 9), (2100, 900))
                save_jpeg(target, OUT / "scenes" / f"{key}.jpg", 82)
                total_after += (OUT / "scenes" / f"{key}.jpg").stat().st_size
                # 主城背景：方形裁切，左侧留出建筑热点空间
                square = fit(center_crop(img, 16 / 10), (1600, 1000))
                save_jpeg(square, OUT / "scenes" / "keep_home.jpg", 80)
                total_after += (OUT / "scenes" / "keep_home.jpg").stat().st_size
            elif key == "worldmap":
                save_jpeg(fit(img, (1600, 1600)), OUT / "scenes" / f"{key}.jpg", 80)
                total_after += (OUT / "scenes" / f"{key}.jpg").stat().st_size
            else:
                save_jpeg(fit(img, (1400, 933)), OUT / "scenes" / f"{key}.jpg", 80)
                total_after += (OUT / "scenes" / f"{key}.jpg").stat().st_size

    print(f"优化完成：{(total_after / 1024 / 1024):.1f} MB（原始 {(total_before / 1024 / 1024):.1f} MB）")
    print(f"输出目录：{OUT}")
    for group in sorted(OUT.iterdir()):
        if group.is_dir():
            files = sorted(group.glob("*.jpg"))
            print(f"  {group.name}: {len(files)} 个文件，{sum(f.stat().st_size for f in files) / 1024:.0f} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())