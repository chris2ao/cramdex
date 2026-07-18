"""Fictional demo course data: MOON-101 Lunar Base Incident Response.

Module-level data only, no logic. Every scenario, term, and citation in this
file is invented for the demo pack; none of it echoes any real courseware.
`pdf_writer.write_pdf` turns `BOOKS[*]["pages"]` into the demo PDFs, and
`PACK_FILES` becomes the rest of the course pack (topics, glossary,
frameworks, acronyms, slide index, notes, and lab workbook files).
"""
from __future__ import annotations

COURSE_NAME = "MOON-101 Lunar Base Incident Response"

BOOKS = [
    {
        "slug": "book1",
        "label": "Book 1",
        "filename": "MOON-101 - Book 1.pdf",
        "pages": [
            [
                "Welcome to Lunar Base Incident Response",
                "MOON-101 introduces Lunar Base Incident Response, or LBIR.",
                "Every resident completes this course before their first "
                "shift.",
                "It pairs base fundamentals with playbooks and hands-on "
                "drills.",
                "1",
            ],
            [
                "Station Layout and Roles",
                "Cinder Hollow Station has four sectors, from Habitat to "
                "Crater Rim.",
                "The Incident Commander leads during any declared "
                "incident.",
                "The Dust Marshal and Crater Watch Officer support that "
                "role.",
                "New residents shadow a mentor before their first solo "
                "shift.",
                "2",
            ],
            [
                "The Demo Cycle Framework",
                "The Demo Cycle is the promoted five-phase response "
                "framework.",
                "Its phases run Detect, Muster, Contain, Recover, and "
                "Debrief.",
                "Every drill cites which Demo Cycle phase was active at "
                "the time.",
                "3",
            ],
            [
                "Ops Tempo Doctrine",
                "Ops Tempo sets the cadence of briefings and status "
                "updates.",
                "Normal Ops Tempo briefs every twelve hours station-wide.",
                "During an incident, that cadence tightens to two hours.",
                "4",
            ],
            [
                "Dust Lock Procedures",
                "A Dust Lock quarantines an airlock section under "
                "suspicion.",
                "Technicians run the Dust Protocol Checklist, or DPC, "
                "first.",
                "No one crosses a Dust Lock until the Dust Marshal signs "
                "off.",
                "5",
            ],
            [
                "Crater Watch Rotation",
                "Crater Watch monitors the rim perimeter for hazards.",
                "The Crater Watch Rotation, or CWR, staffs the post in "
                "pairs.",
                "A missed handoff escalates straight to the Incident "
                "Commander.",
                "6",
            ],
            [
                "Regolith Sweep Drills",
                "A Regolith Sweep is the drill for clearing dust "
                "contamination.",
                "Every crew runs one Regolith Sweep each Demo Cycle.",
                "Instructors score it against the Dust Protocol Checklist.",
                "7",
            ],
            [
                "Fundamentals Review",
                "Book 1 covered the Demo Cycle, Ops Tempo, and Dust Lock.",
                "It also covered Crater Watch and Regolith Sweep drills.",
                "Book 2 turns these fundamentals into emergency playbooks.",
                "8",
            ],
        ],
    },
    {
        "slug": "book2",
        "label": "Book 2",
        "filename": "MOON-101 - Book 2.pdf",
        "pages": [
            [
                "Emergency Playbooks Overview",
                "Book 2 covers playbooks used once Demo Cycle reaches "
                "Contain.",
                "Each playbook maps a hazard to roles and an Ops Tempo "
                "change.",
                "Playbooks assume you finished Book 1 and know the "
                "station.",
                "1",
            ],
            [
                "Dust Contamination Playbook",
                "A dust event starts with a Dust Lock and a DPC review.",
                "The Dust Marshal briefs the Incident Commander within "
                "ten minutes.",
                "Ops Tempo shifts to two-hour briefings until the lock "
                "clears.",
                "2",
            ],
            [
                "Micrometeorite Strike Playbook",
                "Crater Watch reports a strike within ninety seconds.",
                "The Crater Watch Rotation seals the module and checks "
                "the hull.",
                "A confirmed strike triggers an immediate Regolith Sweep.",
                "3",
            ],
            [
                "Life Support Fault Playbook",
                "A life support fault forces Ops Tempo to fifteen-minute "
                "updates.",
                "The Incident Commander declares it under the Demo Cycle "
                "Contain phase.",
                "Fabrication crews stand by to print replacement "
                "filtration parts.",
                "4",
            ],
            [
                "Communications Blackout Playbook",
                "A blackout suspends normal Ops Tempo broadcasts "
                "station-wide.",
                "Crater Watch Officers relay status by hand until relay "
                "returns.",
                "Demo Cycle Recover starts once two broadcasts succeed "
                "in a row.",
                "5",
            ],
            [
                "Fabrication Fire Playbook",
                "A fabrication fire triggers a Dust Lock on the next "
                "corridor.",
                "The Dust Marshal and Incident Commander authorize "
                "venting together.",
                "A full Regolith Sweep follows before the sector "
                "reopens.",
                "6",
            ],
            [
                "Medical Emergency Playbook",
                "Medical emergencies escalate Ops Tempo right away.",
                "The nearest Crater Watch team relays the call for help.",
                "Every medical playbook ends with a Demo Cycle Debrief "
                "entry.",
                "7",
            ],
            [
                "Playbooks Review",
                "Book 2 covered dust, strikes, faults, blackout, fire, "
                "and medical.",
                "Each playbook ties back to Demo Cycle and Ops Tempo "
                "from Book 1.",
                "The Workbook turns these into hands-on Regolith Sweep "
                "drills.",
                "8",
            ],
        ],
    },
    {
        "slug": "workbook",
        "label": "Workbook",
        "filename": "MOON-101 - Workbook.pdf",
        "pages": [
            [
                "Workbook Introduction",
                "This Workbook turns the frameworks into graded practice "
                "drills.",
                "Each lab pairs a scenario with steps and a comparison "
                "sheet.",
                "Do the labs in order since later drills build on "
                "earlier ones.",
                "1",
            ],
            [
                "Lab 1.1 Prep: Regolith Sweep Basics",
                "Lab 1.1 walks a new Dust Marshal through a first "
                "Regolith Sweep.",
                "Bring the Dust Protocol Checklist and a stopwatch for "
                "timing.",
                "Review Book 1 page 7 if the Regolith Sweep steps feel "
                "unfamiliar.",
                "2",
            ],
            [
                "Lab 1.2 Prep: Crater Watch Handoff",
                "Lab 1.2 drills a full Crater Watch Rotation handoff.",
                "Trainees swap the watch post role every six minutes.",
                "The comparison sheet scores the escalation speed.",
                "3",
            ],
            [
                "Ops Tempo Drill Notes",
                "Trainees shift Ops Tempo from twelve hours to two "
                "hours.",
                "A missed broadcast counts against the team's Demo "
                "Cycle score.",
                "Instructors reset Ops Tempo once the drill scenario "
                "ends.",
                "4",
            ],
            [
                "Dust Lock Escalation Drill",
                "This drill chains a dust event into a full Dust Lock "
                "and DPC review.",
                "Trainees must brief the Incident Commander inside the "
                "time window.",
                "A late briefing forces a restart of the Regolith Sweep.",
                "5",
            ],
            [
                "Multi-Hazard Drill",
                "This drill layers a micrometeorite strike on an active "
                "Dust Lock.",
                "Crater Watch and the Dust Marshal must coordinate "
                "closely.",
                "Instructors grade the Regolith Sweep and the Crater "
                "Watch handoff.",
                "6",
            ],
            [
                "Debrief Writing Guide",
                "Every drill closes with a Debrief tied to a Demo Cycle "
                "phase.",
                "A good Debrief names the action taken and its outcome.",
                "Instructors compare it against the lab comparison "
                "sheet.",
                "7",
            ],
            [
                "Workbook Review",
                "This Workbook covered sweeps, handoffs, tempo, and "
                "multi-hazard drills.",
                "Trainees who finish every lab earn certification for "
                "solo shifts.",
                "Revisit Book 1 and Book 2 whenever a drill exposes a "
                "gap.",
                "8",
            ],
        ],
    },
]

_TOPICS_YAML = """\
promoted:
  - key: DEMO-CYCLE
    label: Demo Cycle
  - key: OPS TEMPO
    label: Ops Tempo
themes:
  book1: Fundamentals
  book2: Playbooks
  workbook: Drills
fallback: General
"""

_GLOSSARY_MD = """\
# MOON-101 Glossary

Core terms used throughout the Lunar Base Incident Response course.

| Term | Definition | See |
|---|---|---|
| **Regolith Sweep** | Containment drill that clears and verifies dust contamination in a sector. | Book 1 p.7 |
| **Demo Cycle** | The promoted five-phase incident response framework: Detect, Muster, Contain, Recover, Debrief. | Book 1 p.3 |
| **Ops Tempo** | Cadence doctrine governing how often crews brief and broadcast status. | Book 1 p.4 |
| **Dust Lock** | Quarantine seal placed on an airlock section suspected of regolith contamination. | Book 1 p.5 |
| **Crater Watch** | Standing rotation that monitors the rim perimeter for hazards. | Book 1 p.6 |
| **LBIR** | Lunar Base Incident Response, the discipline this course teaches. | Book 1 p.1 |
| **DPC** | Dust Protocol Checklist, run before releasing any Dust Lock. | Book 1 p.5 |
| **CWR** | Crater Watch Rotation, the formal schedule for Crater Watch duty. | Book 1 p.6 |
| **Incident Commander** | The role holding authority during any declared incident. | Book 1 p.2 |
| **Dust Marshal** | The role responsible for Dust Lock sign-off and DPC review. | Book 1 p.2 |
"""

_FRAMEWORKS_MD = """\
# MOON-101 Frameworks Reference

Frameworks referenced throughout Books 1 and 2.

## Demo Cycle
The Demo Cycle is the promoted five-phase framework for handling any
incident at Cinder Hollow Station: Detect, Muster, Contain, Recover, and
Debrief.
See: Book 1 p.3

## Ops Tempo
Ops Tempo sets the cadence of briefings and status broadcasts, tightening
from a twelve-hour cadence to a two-hour cadence once an incident is
declared.
See: Book 1 p.4

## Dust Lock
A Dust Lock is the quarantine seal placed on an airlock section suspected
of regolith contamination, released only after the Dust Protocol Checklist
clears.
See: Book 1 p.5

---

Book map: Book 1 lays the foundation, Book 2 applies these frameworks to
specific playbooks, and the Workbook drills them under time pressure.
"""

_ACRONYMS_MD = """\
# MOON-101 Acronyms

Acronyms used throughout the Lunar Base Incident Response course.

| Acronym | Expansion | See |
|---|---|---|
| **LBIR** | Lunar Base Incident Response | Book 1 p.1 |
| **DPC** | Dust Protocol Checklist | Book 1 p.5 |
| **CWR** | Crater Watch Rotation | Book 1 p.6 |
"""

_SLIDE_INDEX_MD = """\
# MOON-101 Slide Index (auto-generated)

| Term / Slide title | Book | Page |
|---|---|---|
| Welcome to Lunar Base Incident Response | Book 1 | 1 |
| Station Layout and Roles | Book 1 | 2 |
| The Demo Cycle Framework | Book 1 | 3 |
| Ops Tempo Doctrine | Book 1 | 4 |
| Dust Lock Procedures | Book 1 | 5 |
| Crater Watch Rotation | Book 1 | 6 |
| Regolith Sweep Drills | Book 1 | 7 |
| Emergency Playbooks Overview | Book 2 | 1 |
| Dust Contamination Playbook | Book 2 | 2 |
| Micrometeorite Strike Playbook | Book 2 | 3 |
| Workbook Introduction | Workbook | 1 |
| Lab 1.1 Prep: Regolith Sweep Basics | Workbook | 2 |
"""

_ORIENTATION_MD = """\
# Orientation Notes

New residents should read Book 1 before their first shift. The Demo Cycle
framework and Ops Tempo doctrine come up in nearly every briefing, so learn
the vocabulary early: Dust Lock, Crater Watch, and Regolith Sweep are the
three terms instructors quiz newcomers on most.

Keep a personal cheat sheet of LBIR, DPC, and CWR until the acronyms feel
automatic. Nobody expects fluency on day one, only steady progress toward
it.
"""

_DRILL_NOTES_MD = """\
# Drill Notes

Drills run best when the Dust Marshal calls out each Demo Cycle phase as
the team moves through it. Trainees who narrate their own actions during a
Regolith Sweep score higher on the Workbook comparison sheets.

Crater Watch handoffs fail most often when the outgoing officer forgets to
confirm the Crater Watch Rotation log. Say the CWR entry out loud before
walking away from the post.
"""

_LAB_1_1_MD = """\
# Lab 1.1 - First Regolith Sweep

**Scenario:** A dust sensor flags elevated regolith particulate in the
Fabrication corridor. You are the on-duty Dust Marshal for this Demo
Cycle.

Walk through a full Regolith Sweep from the moment the sensor trips to the
Debrief entry that closes it out.

## Steps

1. Call a Dust Lock on the Fabrication corridor and log the time.
2. Run the Dust Protocol Checklist (DPC) before anyone re-enters the sector.
3. Complete the Regolith Sweep and record particulate readings every five
   minutes.
4. Brief the Incident Commander once readings return to baseline.
5. Close the drill with a Debrief entry naming the Demo Cycle phase
   reached.
"""

_LAB_1_2_MD = """\
# Lab 1.2 - Crater Watch Handoff Drill

**Scenario:** You are mid-shift on Crater Watch when the relief officer is
five minutes late. Practice the missed-handoff escalation from Book 1.

Work through the handoff timing and the escalation path to the Incident
Commander if the relief officer does not arrive.

## Steps

1. Note the scheduled handoff time in the Crater Watch Rotation log.
2. Wait the full grace period defined for a missed handoff.
3. Escalate to the Incident Commander if no relief has arrived.
4. Record the CWR entry once the handoff finally completes.
5. Debrief on what slowed the relief officer down.
"""

_LAB_1_2_COMPARISON_MD = """\
# Lab 1.2 Comparison - Crater Watch Handoff Drill

This sheet compares two approaches to Lab 1.2 so trainees can see where
their escalation timing diverged from the reference response.

**Fast escalation:** Some trainees escalate to the Incident Commander the
moment the grace period ends, keeping the Crater Watch Rotation log tight
but risking false alarms if the relief officer was only briefly delayed.

**Patient escalation:** Others wait for a radio check before escalating,
which avoids false alarms but can leave the watch post short-staffed
longer than the Demo Cycle guidance recommends.

Instructors score both approaches against the reference timing in Lab 1.2
and note which one better matches the CWR standard for this station.
"""

_INDEX_SEED_JSON = """\
{
  "version": 1,
  "entries": [
    {
      "term": "Demo Cycle",
      "definition": "Five-phase lifecycle every lunar base incident walks through: Detect, Muster, Contain, Recover, Debrief.",
      "citations": [{"slug": "book1", "label": "Book 1", "page": 3}],
      "topic": "Demo Cycle"
    },
    {
      "term": "Ops Tempo",
      "definition": "Cadence of briefings, shift handoffs, and status checks while an incident is open.",
      "citations": [{"slug": "book2", "label": "Book 2", "page": 4}],
      "topic": "Ops Tempo"
    },
    {
      "term": "Regolith Sweep",
      "definition": "Post-incident cleanup pass that confirms no dust contamination remains in affected modules.",
      "citations": [{"slug": "book1", "label": "Book 1", "page": 6}],
      "topic": "Demo Cycle"
    },
    {
      "term": "Dust Lock",
      "definition": "Containment posture that seals a module airlock until particulate readings return to baseline.",
      "citations": [{"slug": "book2", "label": "Book 2", "page": 2}],
      "topic": ""
    },
    {
      "term": "Crater Watch",
      "definition": "Standing monitoring rotation that flags surface anomalies before they become incidents.",
      "citations": [{"slug": "book2", "label": "Book 2", "page": 6}],
      "topic": "Ops Tempo"
    },
    {
      "term": "LBIR",
      "definition": "Lunar Base Incident Response, the umbrella program this course trains.",
      "citations": [{"slug": "book1", "label": "Book 1", "page": 1}],
      "topic": ""
    },
    {
      "term": "DPC",
      "definition": "Dust Protocol Checklist, the step list crews run before reopening a sealed module.",
      "citations": [{"slug": "book1", "label": "Book 1", "page": 5}],
      "topic": ""
    },
    {
      "term": "Meteor Drill Scenario",
      "definition": "Tabletop exercise that rehearses the full Demo Cycle against a simulated meteor strike.",
      "citations": [{"slug": "workbook", "label": "Workbook", "page": 2}],
      "topic": "Demo Cycle"
    }
  ]
}
"""

PACK_FILES = {
    "topics.yaml": _TOPICS_YAML,
    "glossary.md": _GLOSSARY_MD,
    "frameworks.md": _FRAMEWORKS_MD,
    "acronyms.md": _ACRONYMS_MD,
    "slide-index.md": _SLIDE_INDEX_MD,
    "notes/orientation.md": _ORIENTATION_MD,
    "notes/drill-notes.md": _DRILL_NOTES_MD,
    "labs/workbook/lab-1.1.md": _LAB_1_1_MD,
    "labs/workbook/lab-1.2.md": _LAB_1_2_MD,
    "labs/workbook/lab-1.2-comparison.md": _LAB_1_2_COMPARISON_MD,
    "index-seed.json": _INDEX_SEED_JSON,
}
