# Contributing

Thanks for helping. This is one person's handwriting, so the letters themselves stay mine. Help with everything around
them is very welcome.

## Report a letter that looks wrong

[Open an issue](https://github.com/Whiteknight07/stavan-font/issues/new?template=bad-letter.yml) with the character,
a screenshot and the app you typed it in. Each letter has five versions, so say which one if you can. The
[playground](https://font.stavan.ai/) shows all five under "where each letter came from".

## Good first contributions

- Bugs or rough edges in the playground (`site/`)
- Better kerning or spacing for specific pairs (`hand/build_font.py`)
- New ways to use the font: integrations, examples, tools
- Testing in apps not listed in the README, and reporting whether the letter rotation works there

## Working on the code

```sh
# site + /write.svg, locally (Cloudflare Workers)
npm run dev

# font: needs Python 3.12, potrace and requirements.txt
cd hand && python build_font.py && python golden.py && node ../test/layout.test.mjs
```

`site/stavan.js` mirrors the font's `calt` and `kern` features so the pen replay lands exactly where the font puts each
letter. If you change the features in `build_font.py`, update `stavan.js` too. `test/layout.test.mjs` will tell you if
they drift apart.

Keep pull requests small and say what changed and why.
