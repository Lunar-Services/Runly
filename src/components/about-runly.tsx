"use client";

import FlipCard from "./react-bits/FlipCard";
import "./about-runly.css";

const people = [
  {
    name: "Furat",
    role: "Founder & Product Lead",
    focus: "Vision. Product. Purpose.",
    intro:
      "Turning ideas into real products, and bringing the right people together.",
    paragraphs: [
      "Furat is the founder of LunarGroup and the person behind the overall vision of its products.",
      "He leads product direction, business strategy, branding, design decisions, and how products like Runly are positioned and built. His focus is turning ideas into real products, bringing the right people together, and making sure everything LunarGroup builds has a clear purpose instead of just being another piece of software.",
    ],
  },
  {
    name: "Marco",
    role: "CEO",
    focus: "Systems. Engineering. Direction.",
    intro:
      "Building the technical foundations that turn a product vision into something dependable.",
    paragraphs: [
      "Marco is the CEO of LunarGroup and also works directly on the technical side of the company. His focus is backend development, infrastructure, systems architecture, and making sure the technology behind LunarGroup’s products is built properly.",
      "Alongside leading the company, he stays involved in development and helps shape the technical direction behind products like Runly.",
    ],
  },
];

export function AboutRunly() {
  return (
    <section id="about" className="about-runly" aria-labelledby="about-title">
      <div className="about-story">
        <div className="about-heading">
          <span className="about-eyebrow">THE PEOPLE BEHIND THE PRODUCT</span>
          <h2 id="about-title">
            Runly is built
            <br />
            by LunarGroup.
          </h2>
          <div className="lunar-signature" aria-hidden="true">
            <span className="lunar-orbit">
              <i />
              <i />
            </span>
            <span>
              LunarGroup<span>Ideas into reality.</span>
            </span>
          </div>
        </div>
        <div className="about-copy">
          <p>
            LunarGroup is the company behind Runly, focused on building software
            products with strong design, solid engineering, and real-world
            usefulness.
          </p>
          <p>
            Runly is one of the products we’re putting our full focus into,
            bringing together our work across development, infrastructure,
            design, and product.
          </p>
          <p className="about-principle">
            We build with a simple approach:
            <br />
            <strong>
              move fast, stay focused,
              <br />
              and make products worth using.
            </strong>
          </p>
        </div>
      </div>
      <div className="about-team-heading">
        <span className="about-eyebrow">MEET THE TEAM</span>
        <p>
          Different strengths.
          <br />
          One shared direction.
        </p>
      </div>
      <div className="about-team">
        {people.map((person) => (
          <FlipCard
            key={person.name}
            name={person.name}
            front={
              <div className="person-front">
                <span className="person-role">{person.role}</span>
                <div className="person-monogram" aria-hidden="true">
                  <span>{person.name[0]}</span>
                  <i />
                </div>
                <h3>{person.name}</h3>
                <p className="person-focus">{person.focus}</p>
                <p>{person.intro}</p>
              </div>
            }
            back={
              <div className="person-back">
                <span className="person-role">{person.role}</span>
                <h3>{person.name}</h3>
                {person.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            }
          />
        ))}
      </div>
    </section>
  );
}
