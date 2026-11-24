# contributions-drop

Turn your GitHub contribution graph into an auto-playing falling-block puzzle.

Every green square of your graph becomes one block. Blocks are grouped by four (in date order) into the seven classic four-block pieces, which fall onto the board. A small built-in player places each piece, clears full lines, and the animation loops once every square has fallen.

- Board: `official` (10 × 20, default), `18x7`, `14x7`, or `graph` (same size as your contribution graph: weeks × 7)
- Rules: 7 pieces, SRS rotation with wall kicks, 7-bag randomizer (seeded by user name and year, so the same graph gives the same game), line clears
- Colors: the contribution level of each day

## Usage

Add a workflow to your profile repository (`<you>/<you>`):

```yaml
# .github/workflows/contributions-drop.yml
name: contributions-drop
on:
  schedule:
    - cron: "0 0 * * *"
  workflow_dispatch:
jobs:
  generate:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: t4kamuna/contributions-drop@v0.1.0
        with:
          github_user_name: ${{ github.repository_owner }}
          outputs: |
            dist/contributions-drop.svg
            dist/contributions-drop-dark.svg?palette=github-dark
      - name: push to output branch
        run: |
          cd dist
          git init -q -b output
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add .
          git commit -q -m "update contributions-drop"
          git push -f "https://x-access-token:${{ github.token }}@github.com/${{ github.repository }}.git" output
```

Then embed it in your `README.md`:

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/<you>/<you>/output/contributions-drop-dark.svg" />
  <img alt="contributions-drop" src="https://raw.githubusercontent.com/<you>/<you>/output/contributions-drop.svg" />
</picture>
```

### Inputs

| name | required | description |
| --- | --- | --- |
| `github_user_name` | yes | User whose graph is used |
| `outputs` | yes | One file per line. Options as a query string: `?palette=github-light` (default) or `github-dark`, `&board=...` to override the board |
| `board` | no | Default board for all outputs: `official` (default), `18x7`, `14x7`, `graph` |
| `github_token` | no | Defaults to `${{ github.token }}` |

## Local preview

```sh
npm ci
node --import tsx src/cli.ts --fake 0.6 --out preview.svg          # made-up graph
node --import tsx src/cli.ts --fake 0.6 --board 18x7 --out preview.svg
GITHUB_TOKEN=... node --import tsx src/cli.ts --user <name> --out preview.svg
```

## License

MIT
