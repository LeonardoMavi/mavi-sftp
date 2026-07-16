from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "build" / "icon.png"
TARGET = ROOT / "build" / "icon.ico"
TASKBAR_TARGET = ROOT / "build" / "icon-taskbar.png"
SIZES = [16, 24, 32, 48, 64, 128, 256]


def make_frame(source: Image.Image, size: int) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    # Preserva quase toda a proporcao original, com apenas um leve ganho de
    # altura para melhorar a leitura na barra de tarefas.
    target_width = max(1, round(size * 0.94))
    proportional_height = target_width * source.height / source.width
    target_height = max(1, min(round(size * 0.76), round(proportional_height * 1.12)))
    resized = source.resize(
        (target_width, target_height),
        Image.Resampling.LANCZOS,
    )
    canvas.alpha_composite(resized, ((size - resized.width) // 2, (size - resized.height) // 2))
    return canvas


def main() -> None:
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    source = Image.open(SOURCE).convert("RGBA")
    frame = make_frame(source, 256)
    frame.save(TASKBAR_TARGET, format="PNG")
    frame.save(TARGET, format="ICO", sizes=[(size, size) for size in SIZES])


if __name__ == "__main__":
    main()
