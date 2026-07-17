# Research: Filtering Freesound APIv2 search by Broad Sound Taxonomy category

Date: 2026-07-17. Sources: Freesound APIv2 docs and the MTG/freesound source repo (authoritative for field spellings). No live API calls were made.

## Verdicts

### 1. Filter field name and value syntax — SUPPORTED: `category` (display names, not codes)

The search endpoint's `filter` parameter accepts any Sound Instance field marked "yes" in the filtering column. From the docs table ([resources_apiv2.html](https://freesound.org/docs/api/resources_apiv2.html), Response (sound instance)):

> `category` — string — yes — "Category name (top-level category) from the Broad Sound Taxonomy (e.g. "Instrument samples"). Note that categories are filled out by an algorithm if not provided by the original uploader of the sound."

Values are the human-readable top-level names, NOT taxonomy codes. Canonical top-level values, verbatim from the taxonomy definition CSV ([`_docs/bst_description_v1.1_250725.csv`](https://github.com/MTG/freesound/blob/master/_docs/bst_description_v1.1_250725.csv), `top_level` column; loaded by `freesound/settings.py` as `BROAD_SOUND_TAXONOMY`):

| code | top_level name |
|------|----------------|
| `m`  | `Music` |
| `is` | `Instrument samples` |
| `sp` | `Speech` |
| `fx` | `Sound effects` |
| `ss` | `Soundscapes` |

Syntax rules from the docs:

> "For multi-word queries, the values must be enclosed in double quotes and separated by spaces (filter=filtername:"val ue")."

Docs example (verbatim URL from the Search examples section, also in [`apiv2/examples.py`](https://github.com/MTG/freesound/blob/master/apiv2/examples.py)):

```
https://freesound.org/apiv2/search/?query=music&filter=category:Music%20subcategory:"Solo%20instrument"
```

The site itself links category searches as `f=category:%22Sound effects%22` (quoted), see [`templates/sounds/broad_sound_taxonomy_info_page.html`](https://github.com/MTG/freesound/blob/master/templates/sounds/broad_sound_taxonomy_info_page.html).

**Canonical form recommendation for the seed string: always double-quote the value** — `category:"Music"`, `category:"Sound effects"` — since three of the five names contain spaces and quoting single-word values is also valid Solr syntax. Do NOT use `bst:m`, `bst_category`, or `category_code:` in search filters:

- `category_code` has a BLANK filtering column in the docs (not "yes"), and in source it is a derived serializer value, not a Solr field — [`apiv2/views.py`](https://github.com/MTG/freesound/blob/master/apiv2/views.py) computes it from `category` + `subcategory` at response time; [`utils/search/backends/solr555pysolr.py`](https://github.com/MTG/freesound/blob/master/utils/search/backends/solr555pysolr.py) indexes only the name fields (`SEARCH_SOUNDS_FIELD_CATEGORY`/`_SUBCATEGORY` as string dynamic fields).
- `bst_category` exists only as an upload/describe/edit request parameter ("The ID of a category to be assigned to the sound"), not a search filter.

### 2. Multi-value OR — SUPPORTED (docs show the operator; quoted-value combo untested)

Docs, verbatim:

> "Simple logic operators can also be used in filters: filter=type:(wav OR aiff)"

`category` is indexed as a Solr string field, so `category:("Music" OR "Speech")` is standard Solr syntax and should work. The docs never show OR combined with quoted multi-word values, so `category:("Sound effects" OR "Music")` specifically is UNVERIFIED — see probe below. A guaranteed-safe equivalent is field-level OR, which the docs' geotag examples demonstrate: `filter=category:"Sound effects" OR category:"Music"`.

### 3. `fields=` on search results — SUPPORTED

The search `fields` parameter accepts "any of those listed in Response (sound instance)". The sound instance table lists (verbatim):

> `category` — string — "Category name (top-level category) from the Broad Sound Taxonomy (e.g. "Instrument samples")."
> `category_code` — string — "The category ID from the Broad Sound Taxonomy (e.g. "fx-a", with the prefix indicating the category and the suffix indicating the subcategory)."
> `category_is_user_provided` — boolean — "Whether the category (and category_code) were provided by the author of the sound or assigned automatically by an algorithm."

So `fields=id,name,category,subcategory,category_code` works; response values look like `"category": "Sound effects"`, `"category_code": "fx-a"`. Not in the default field set (`fields=id,name,tags,username,license` by default) — request it explicitly.

### 4. Subcategory — SUPPORTED: `subcategory`

Docs, verbatim (note the docs' own typo "Subategory"):

> `subcategory` — string — yes — "Subategory name (second-level category) from the Broad Sound Taxonomy (e.g. "Piano / Keyboard instruments"). For optimal results, it is recommended to use this filter in combination with the `category` filter."

Second-level values are also display names (e.g. `Solo instrument`, `Piano / Keyboard instruments`), from the `second_level` column of the same CSV.

## Caveats

- Categories are algorithm-assigned when the uploader didn't provide one (docs note on every category field), so a `category` filter matches predicted categories too. `category_is_user_provided` is marked "no" for filtering — you cannot restrict to human-labeled sounds.
- Field names in the API filter are exactly `category` / `subcategory` (confirmed in [`freesound/settings.py`](https://github.com/MTG/freesound/blob/master/freesound/settings.py): `SEARCH_SOUNDS_FIELD_SUBCATEGORY = "subcategory"`, and [`freesound/audio_descriptor_settings.py`](https://github.com/MTG/freesound/blob/master/freesound/audio_descriptor_settings.py) descriptor names `category`/`subcategory`, type string).

## Live probes to settle remaining uncertainty (need an API token)

1. Parenthesized OR with quoted multi-word values:
   `https://freesound.org/apiv2/search/?filter=category:(%22Sound%20effects%22%20OR%20%22Music%22)&fields=id,category&token=...`
2. Fallback if (1) fails — field-level OR:
   `https://freesound.org/apiv2/search/?filter=category:%22Sound%20effects%22%20OR%20category:%22Music%22&fields=id,category&token=...`
3. Confirm `category_code` is NOT filterable (expect no results or an error):
   `https://freesound.org/apiv2/search/?filter=category_code:fx-a&fields=id,category_code&token=...`
