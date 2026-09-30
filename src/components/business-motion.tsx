"use client";

import ParticleText from "./react-bits/ParticleText";
import { useTheme } from "./theme-provider";
import "./business-stories.css";

const examples = [
  {
    category: "Independent studio",
    title: "A clearer first impression.",
    body: "A portfolio that explains your services, shows your work, and gives clients a place to enquire.",
  },
  {
    category: "Local business",
    title: "Make the next step obvious.",
    body: "An online home for your opening hours, services, and booking information.",
  },
  {
    category: "Digital product",
    title: "Start with one useful thing.",
    body: "A focused tool that helps a particular customer solve a particular problem.",
  },
  {
    category: "Small team",
    title: "Less scattered work.",
    body: "A client portal concept for requests, project updates, and shared resources.",
  },
];

export function BusinessMotion() {
  const { darkTheme } = useTheme();
  return (
    <section
      className="business-motion"
      aria-labelledby="business-examples-title"
    >
      <div className="business-heading">
        <div>
          <h2 id="business-examples-title">
            Small beginnings.
            <br />
            Real possibilities.
          </h2>
          <p>
            Illustrative business ideas—not customer reviews or completed Runly
            projects.
          </p>
        </div>
      </div>
      <div className="business-ribbon">
        <div className="business-ribbon-track">
          {[0, 1].map((copy) => (
            <div
              className="business-ribbon-group"
              key={copy}
              aria-hidden={copy === 1}
            >
              {examples.map((example, index) => (
                <article key={example.category}>
                  <div className="business-card-label">
                    <span>{example.category}</span>
                    <span aria-hidden="true">0{index + 1}</span>
                  </div>
                  <h3>{example.title}</h3>
                  <p>{example.body}</p>
                </article>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div
        className="business-type"
        aria-label="Turn an idea into your next chapter"
      >
        <ParticleText
          text="Your next chapter."
          trigger="mount"
          pointerRepel={0}
          color={darkTheme ? "#f2f2f2" : "#191919"}
          highlightColor={darkTheme ? "#bcbcbc" : "#656565"}
        />
        <span>Make something worth sharing.</span>
      </div>
    </section>
  );
}
