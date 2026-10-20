export type WorkspaceView = "new" | "website" | "app" | "video" | "editor";
export type WorkspaceProjectView = "website" | "app" | "video";

export const workspaceProjects = [
  { view: "website", name: "Offscript website", icon: "globe" },
  { view: "video", name: "Cloud nine edit", icon: "video" },
  { view: "app", name: "Daylight app", icon: "app" },
] as const;

export const workspaceFixtures = {
  website: {
    prompt:
      "Build a clean website for my creative studio, Offscript. Olive tones and bold typography.",
    response:
      "I’ve created a first direction for Offscript: editorial typography, a muted olive palette, and plenty of room for your work.",
    features: [
      "Responsive landing page",
      "Work and studio sections",
      "Contact form",
    ],
    domain: "offscript.runly.app",
  },
  app: {
    prompt:
      "Create a habit-tracking app called Daylight. Calm, simple, and easy to use.",
    response:
      "Here’s Daylight: a calm home for daily habits, with a weekly overview and a simple way to check in.",
    features: [
      "Daily habit checklist",
      "Weekly activity overview",
      "Mobile-first layout",
    ],
    domain: "daylight.runly.app",
  },
  video: {
    prompt:
      "Turn these clips into a dreamy 15-second edit. Add titles and cut to the music.",
    response:
      "Your first cut is ready. I’ve kept the pacing gentle and matched each transition to the music.",
    features: [
      "Clips trimmed to 15 seconds",
      "Titles and captions added",
      "Music synced to transitions",
    ],
    domain: "cloud-nine.runly.app",
  },
} as const;

export const workspaceCode = {
  website: `export default function Offscript() {\n  return (\n    <main className="offscript">\n      <header>offscript®</header>\n      <h1>Good ideas<br />deserve to<br />stand out.</h1>\n      <p>Independent design for people\ndoing things differently.</p>\n      <button>Explore our work</button>\n    </main>\n  );\n}\n`,
  app: `export default function Daylight() {\n  const habits = ["Morning walk", "Read 10 pages", "Make something"];\n  return (\n    <main>\n      <h1>Daylight</h1>\n      <p>A little better, every day.</p>\n      <h2>Your week</h2>\n      <section aria-label="Today's habits">\n        {habits.map((habit) => <button key={habit}>{habit}</button>)}\n      </section>\n    </main>\n  );\n}\n`,
  video: `export const video = {\n  title: "Cloud nine",\n  format: "16:9",\n  duration: "00:24",\n  tracks: ["Main footage", "Titles", "Music"],\n};\n`,
};
