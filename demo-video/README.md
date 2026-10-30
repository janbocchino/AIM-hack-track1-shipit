# LEVRIQ hackathon demo

[Watch or download the video](levriq-demo.mp4) · [Preview the scenes](preview.png)

The demo runs for **1:44** at **1920 × 1080**, 24 fps, encoded as H.264 MP4.
It uses English on-screen text and has no audio track.

The six-second opening establishes a medical emergency and says “She needs
urgent medical assessment.” It moves directly into the role-and-task workflow,
then covers clinical evidence, the five-stage architecture, role switching, and
three clinical benefits. The final screen shows the LEVRIQ logo and tagline.

## Product footage to add

The recording slots remain explicitly labelled placeholders. They do not show
actual application captures. The architecture is conceptual and should be
checked against the final implementation before the hackathon submission.

| Time | Intended recording |
| --- | --- |
| 00:06–00:18 | Enter the emergency physician role and clinical question. |
| 00:18–00:40 | Review findings, missing information and conflicts; open an original source passage. |
| 01:06–01:20 | Switch to the anaesthetist role and show the changed priorities. |

Each slot reserves a 16:9 viewport: x=680, y=270, width=1152, height=648.
Coordinates use a top-left origin on the 1920 × 1080 canvas.

## Edit and rebuild

- `render.swift` contains the graphics, text, animation and video export.
- `storyboard.json` defines scene boundaries and recording slots.
- `narration.txt` is an optional voiceover script; it is not used in this cut.
- `verify.swift` checks the encoded video and extracts review frames.
- `verification.json` records the checks on the included MP4.
- `assets/` contains the original logo, transparent version and background-removal prompt.

Rebuilding requires macOS, the Xcode Command Line Tools, and access to native
video encoding. No package dependencies, API credentials or external services
are required.

Run from this directory:

```sh
mkdir -p build previews
swiftc -O -suppress-warnings render.swift -o build/render
build/render "$PWD"
swiftc -O -suppress-warnings verify.swift -o build/verify
build/verify "$PWD"
```

For graphics-only previews, run `build/render "$PWD" --previews-only`.
The video writer replaces `levriq-demo.mp4` when rendering. Build executables,
intermediate preview frames and layout diagnostics are ignored by Git.

The transparent logo was produced with the built-in imagegen tool from the
supplied original; its exact prompt is retained in `assets/logo-edit-prompt.txt`.
