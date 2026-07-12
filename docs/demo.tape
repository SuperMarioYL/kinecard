# vhs script — the 10-minute happy path, ~30s.
# Rendered to assets/demo.gif by .github/workflows/demo.yml (manual dispatch).
# The committed assets/demo.gif is the rendered card animation (the product's
# output); running this tape swaps it for the CLI capture below.
Output assets/demo.gif

Set Shell "bash"
Set FontSize 20
Set Width 1100
Set Height 640
Set Padding 22
Set Theme "Dracula"

Type "kinecard list"
Enter
Sleep 2.5s

Type "kinecard render examples/card.yaml -t minimal -o out.mp4"
Enter
Sleep 9s

Type "kinecard render examples/card.yaml -t spotlight --project my-card/"
Enter
Sleep 9s

Type "ls my-card/"
Enter
Sleep 2.5s

# edit one line, then re-render just this card from its editable source
Type "sed -i 's/写结构化文案/写清楚一个概念/' my-card/card.yaml"
Enter
Sleep 1s
Type "kinecard render my-card/"
Enter
Sleep 9s
Sleep 2s
