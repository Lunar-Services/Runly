"use client";

import TiltedCard from "./react-bits/TiltedCard";
import "./project-journey.css";

const steps = [
  {
    image: "67345",
    label: "Start with a thought",
    title: "Your words are the starting point.",
    body: "Describe the outcome you have in mind. A rough sentence is enough to open the conversation.",
    alt: "Runly cat peeking over an example prompt for a Python development report",
  },
  {
    image: "5345345",
    label: "Give it a home",
    title: "Keep the context close.",
    body: "Bring the conversation, instructions, and files into a project you can return to.",
    alt: "Illustration of a Runly project with instructions and files",
  },
  {
    image: "76453",
    label: "Work through the details",
    title: "Follow the work as it unfolds.",
    body: "Ask questions, explore an approach, and inspect the files that come out of the conversation.",
    alt: "Illustrative research workflow beside generated project files and Runly's cat",
  },
  {
    image: "5345",
    label: "Make it yours",
    title: "A first draft is just the beginning.",
    body: "Review the code and preview, ask for a change, and shape the next version around your idea.",
    alt: "Illustration of website previews beside editable project code",
  },
];

export function ProjectJourney({
  onTryPrompt,
}: {
  onTryPrompt: (prompt: string) => void;
}) {
  return (
    <section className="project-journey" aria-labelledby="journey-title">
      <div className="journey-intro">
        <span className="journey-eyebrow">
          FROM A SENTENCE TO SOMETHING REAL
        </span>
        <h2 id="journey-title">
          A little context.
          <br />A lot of possibility.
        </h2>
        <p>One conversation, with room for the whole project.</p>
      </div>
      <div className="journey-steps">
        {steps.map((step, index) => (
          <article className="journey-step" key={step.image}>
            <div className="journey-copy">
              <span className="journey-step-label">
                <span>0{index + 1}</span>
                {step.label}
              </span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
              {index === 0 && (
                <a
                  href="#hero-prompt"
                  className="journey-try"
                  onClick={() =>
                    onTryPrompt(
                      "Create a Python script that uses the GitHub API to generate a weekly development activity report.",
                    )
                  }
                >
                  Try this starting point
                </a>
              )}
            </div>
            <div className="journey-visual">
              <TiltedCard
                imageSrc={`/images/workflow/${step.image}.png`}
                altText={step.alt}
              />
            </div>
          </article>
        ))}
      </div>
      <p className="journey-disclosure">
        Illustrative workflows and project concepts.
      </p>
    </section>
  );
}
