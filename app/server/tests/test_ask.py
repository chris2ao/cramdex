import asyncio
import json
from types import SimpleNamespace

import ask
import config
from llm import LLMError


def test_sse_preserves_trailing_newline():
    assert ask._sse("delta", "line1\n") == "event: delta\ndata: line1\ndata: \n\n"
    assert ask._sse("done", "") == "event: done\ndata: \n\n"


class _FakeProvider:
    """Yields the given chunks, then completes cleanly."""

    name = "fake"
    display_name = "Fake"

    def __init__(self, chunks):
        self._chunks = chunks

    async def stream(self, system, user):
        for chunk in self._chunks:
            yield chunk


class _FakeErrorProvider:
    """Yields one chunk, then fails mid-stream."""

    name = "fake"
    display_name = "Fake"

    async def stream(self, system, user):
        yield "partial answer "
        raise LLMError("boom")


def test_stream_answer_sse_sequence_sources_deltas_done(fixture_db, monkeypatch):
    monkeypatch.setattr(config, "manifest", lambda: SimpleNamespace(name="Demo Course"))
    provider = _FakeProvider(["chunk one ", "chunk two"])

    async def scenario():
        return [chunk async for chunk in
                ask.stream_answer("DEMO-CYCLE", db_path=fixture_db, provider=provider)]

    events = asyncio.run(scenario())
    assert events[0].startswith("event: sources")
    assert events[1].startswith("event: delta") and "chunk one" in events[1]
    assert events[2].startswith("event: delta") and "chunk two" in events[2]
    assert events[-1] == "event: done\ndata: \n\n"


def test_stream_answer_sources_shape(fixture_db, monkeypatch):
    monkeypatch.setattr(config, "manifest", lambda: SimpleNamespace(name="Demo Course"))
    provider = _FakeProvider([])

    async def scenario():
        return [chunk async for chunk in
                ask.stream_answer("DEMO-CYCLE", db_path=fixture_db, provider=provider)]

    events = asyncio.run(scenario())
    sources_payload = events[0].split("data: ", 1)[1].rstrip("\n")
    sources = json.loads(sources_payload)
    assert sources
    assert set(sources[0].keys()) == {"slug", "label", "printed_page", "snippet"}


def test_stream_answer_forwards_provider_errors_as_sse_error(fixture_db, monkeypatch):
    monkeypatch.setattr(config, "manifest", lambda: SimpleNamespace(name="Demo Course"))

    async def scenario():
        return [chunk async for chunk in
                ask.stream_answer("DEMO-CYCLE", db_path=fixture_db,
                                  provider=_FakeErrorProvider())]

    events = asyncio.run(scenario())
    assert events[0].startswith("event: sources")
    assert events[1].startswith("event: delta") and "partial answer" in events[1]
    assert events[-1].startswith("event: error")
    assert "boom" in events[-1]


def test_stream_answer_emits_sse_error_when_provider_construction_fails(
        fixture_db, monkeypatch):
    """get_provider() (or config.manifest()) can raise config.PackError after
    the sources event has already committed a 200; that must still surface
    as a clean SSE error event rather than propagate out of the generator."""
    monkeypatch.setattr(config, "manifest", lambda: SimpleNamespace(name="Demo Course"))

    def fail_get_provider():
        raise config.PackError("no provider")

    monkeypatch.setattr(ask, "get_provider", fail_get_provider)

    async def scenario():
        return [chunk async for chunk in
                ask.stream_answer("DEMO-CYCLE", db_path=fixture_db)]

    events = asyncio.run(scenario())
    assert len(events) == 2
    assert events[0].startswith("event: sources")
    assert events[1].startswith("event: error") and "no provider" in events[1]
    assert not any(e.startswith("event: done") for e in events)


def test_stream_answer_disconnect_closes_provider_stream_immediately(
        fixture_db, monkeypatch):
    """A client disconnect must close stream_answer's generator, and that
    close must propagate synchronously into the provider's own stream
    generator (no extra event-loop ticks), so a subprocess-backed provider
    kills its child immediately rather than on a later GC pass."""
    monkeypatch.setattr(config, "manifest", lambda: SimpleNamespace(name="Demo Course"))
    closed = {"flag": False}

    class _HangingProvider:
        name = "fake"
        display_name = "Fake"

        async def stream(self, system, user):
            try:
                yield "x"
                await asyncio.Event().wait()
            finally:
                closed["flag"] = True

    async def scenario():
        gen = ask.stream_answer("DEMO-CYCLE", db_path=fixture_db,
                                provider=_HangingProvider())
        assert (await gen.__anext__()).startswith("event: sources")
        assert "x" in await gen.__anext__()
        await gen.aclose()
        assert closed["flag"] is True, (
            "provider stream was not closed synchronously by aclose()")

    asyncio.run(scenario())


def test_stream_answer_reports_no_passages_error(fixture_db, monkeypatch):
    monkeypatch.setattr(config, "manifest", lambda: SimpleNamespace(name="Demo Course"))

    async def scenario():
        return [chunk async for chunk in
                ask.stream_answer("zzznonexistentqueryterm", db_path=fixture_db)]

    events = asyncio.run(scenario())
    assert events == [
        "event: sources\ndata: []\n\n",
        "event: error\ndata: No relevant passages found in the corpus.\n\n",
    ]


def test_build_system_names_course_and_states_grounding_rule():
    system = ask.build_system("Demo Course")
    assert "only" in system.lower()
    assert "Demo Course" in system


def test_build_user_contains_passages_and_question():
    passages = [{"label": "Book 2", "printed_page": 76, "slug": "book2",
                 "snippet": "", "text": "ops tempo cadence"}]
    user = ask.build_user("What is ops tempo?", passages)
    assert "ops tempo cadence" in user
    assert "[Book 2 p.76]" in user
    assert "What is ops tempo?" in user
