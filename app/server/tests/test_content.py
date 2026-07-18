import content

GLOSSARY_MD = """# Title
intro text
| Term | What it is (paraphrased) | See |
|---|---|---|
| **DEMO-CYCLE** | Classic lifecycle. | Book 1 p.70-71 |
| **The Grid** | Core tracker. | Book 1 p.90 |
"""

FRAMEWORKS_MD = """# Header
intro
## DEMO-CYCLE - incident-handling lifecycle
Preparation to Lessons Learned.
See: **Book 1 p.70-71**.

## PACES - layered planning options
Primary / Alternate / Contingency / Emergency.
"""

ACRONYMS_TSV = "acronym\texpansion\tbook\tprinted_page\nAD\tActive Directory\tBook 1\t124\n"


def test_parse_glossary_rows():
    rows = content.parse_glossary(GLOSSARY_MD)
    assert rows[0] == {"term": "DEMO-CYCLE", "definition": "Classic lifecycle.",
                       "see": "Book 1 p.70-71"}
    assert len(rows) == 2


def test_parse_glossary_skips_malformed_rows():
    rows = content.parse_glossary(GLOSSARY_MD + "\n| only two | cells |\n")
    assert len(rows) == 2


def test_parse_acronyms():
    rows = content.parse_acronyms(ACRONYMS_TSV)
    assert rows == [{"acronym": "AD", "expansion": "Active Directory",
                     "book": "Book 1", "printed_page": 124}]


def test_parse_acronyms_skips_non_numeric_page():
    tsv = ("acronym\texpansion\tbook\tprinted_page\n"
           "AD\tActive Directory\tBook 1\t124\n"
           "BAD\tBroken Row\tBook 2\t124-125\n")
    rows = content.parse_acronyms(tsv)
    assert len(rows) == 1
    assert rows[0]["acronym"] == "AD"


ACRONYMS_MD = """# Demo Course Acronyms
intro text
| Acronym | Expansion | See |
|---|---|---|
| **AD** | Active Directory | Book 1 p.124 |
| **BU** | Business Unit | Workbook p.121 |
| **BROKEN** | No citation here | somewhere |
"""

LABELS = ["Book 1", "Workbook"]


def test_parse_acronyms_md():
    rows = content.parse_acronyms_md(ACRONYMS_MD, LABELS)
    assert rows == [
        {"acronym": "AD", "expansion": "Active Directory",
         "book": "Book 1", "printed_page": 124},
        {"acronym": "BU", "expansion": "Business Unit",
         "book": "Workbook", "printed_page": 121},
    ]


def test_parse_frameworks_sections():
    secs = content.parse_frameworks(FRAMEWORKS_MD)
    assert [s["title"] for s in secs] == [
        "DEMO-CYCLE - incident-handling lifecycle",
        "PACES - layered planning options",
    ]
    assert "Lessons Learned" in secs[0]["body"]


def test_parse_frameworks_stops_at_horizontal_rule():
    md = FRAMEWORKS_MD + "\n---\n\nBook map: footer prose for humans.\n"
    secs = content.parse_frameworks(md)
    assert "Book map" not in secs[-1]["body"]
    assert "footer prose" not in secs[-1]["body"]


def test_parse_acronyms_md_skips_bolded_header_row():
    md = ("| **Acronym** | **Expansion** | **Book 1 p.5** |\n"
          "|---|---|---|\n"
          "| **AB** | Alpha Bravo | Book 2 p.10 |\n")
    rows = content.parse_acronyms_md(md, ["Book 1", "Book 2"])
    assert [r["acronym"] for r in rows] == ["AB"]


def test_book_label_pattern_orders_longest_first_so_prefix_cannot_shadow():
    """A label that is a prefix of another must not shadow the longer one."""
    labels = ["Book 1", "Book 1 Extra"]
    citation = content.citation_re(labels)
    m = citation.search("See Book 1 Extra p.5")
    assert m.group(1) == "Book 1 Extra"
