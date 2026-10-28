import Link from "next/link";

const steps = [
  { k: "Identify", d: "Snap the model plate. Muse Spark Open (via Baseten) reads brand, model and serial into a typed record.", api: "/api/identify" },
  { k: "See the part", d: "SAM 3.1 finds the exact part you name, like \u201ctoilet flapper\u201d, and masks it on your camera frame.", api: "/api/segment" },
  { k: "Show, don't tell", d: "Muse Image turns your own photo into an annotated instruction card for the next step.", api: "/api/card" },
  { k: "Safety gate", d: "Muse Glimmer, Meta's open-weights model self-hosted on Modal, stops the job on gas, live mains or scald risk.", api: "/api/safety" },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <p className="text-sm uppercase tracking-widest text-emerald-400">SeeFix by Northbridge</p>
      <h1 className="mt-3 text-5xl font-semibold leading-tight">
        It sees the part.
        <br />
        It checks your work.
      </h1>
      <p className="mt-6 max-w-2xl text-lg text-zinc-300">
        SeeFix is a camera-first repair copilot. Point your phone at a running toilet and it finds the worn flapper, shows
        you the replacement step on your own photo, and verifies the fix before you call it done.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
          <p className="text-sm font-medium text-emerald-300">Avery, first-time renter</p>
          <p className="mt-2 text-zinc-300">
            The toilet keeps running at 2 AM. Avery doesn&apos;t know what a flapper is, and doesn&apos;t want to wait three days for
            the landlord.
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
          <p className="text-sm font-medium text-emerald-300">Morgan, weekend fixer</p>
          <p className="mt-2 text-zinc-300">
            Morgan can follow a video, but wants proof the part matches the model and that the job was done right, not just
            &quot;looks fine&quot;.
          </p>
        </div>
      </div>

      <h2 className="mt-14 text-2xl font-semibold">How it works</h2>
      <ol className="mt-6 grid gap-4 sm:grid-cols-2">
        {steps.map((s, i) => (
          <li key={s.k} className="rounded-xl border border-zinc-800 p-5">
            <p className="font-mono text-xs text-zinc-500">
              {i + 1}. {s.api}
            </p>
            <p className="mt-1 text-lg font-medium">{s.k}</p>
            <p className="mt-1 text-zinc-400">{s.d}</p>
          </li>
        ))}
      </ol>

      <div className="mt-12 flex flex-wrap gap-3">
        <Link href="/lab" className="rounded-lg bg-emerald-500 px-5 py-3 font-medium text-zinc-950 hover:bg-emerald-400">
          Open the lab
        </Link>
        <a href="https://github.com/dl88jing/seefix" className="rounded-lg border border-zinc-700 px-5 py-3 hover:bg-zinc-900">
          Source on GitHub
        </a>
      </div>

      <p className="mt-16 text-sm text-zinc-500">
        Built by team Northbridge during the Meta AI Developer Hackathon (Oct 26 to Nov 4, 2026). Day-one build: the lab
        exercises each model route; the live camera loop lands next.
      </p>
    </main>
  );
}
