"use client";

import Image from "next/image";
import Link from "next/link";
import { PenTool, Layers, Sparkles } from "lucide-react";
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
  {
    name: "Fakita Alsudani",
    role: "Marketing Manager",
    focus: "Community. Communication. Polish.",
    paragraphs: [
      "Fakita leads marketing and social media for LunarGroup, helping shape how our products are presented and how we communicate with our community.",
      "Fakita also contributes to product testing, providing feedback, catching issues, and helping make sure new features feel polished before they reach users.",
    ],
  },
];

const principles = [
  {
    name: "Strong design",
    text: "Clear interfaces. Thoughtful details. Products that feel good to use.",
    icon: PenTool,
  },
  {
    name: "Solid engineering",
    text: "Development, infrastructure, and systems built to support the product.",
    icon: Layers,
  },
  {
    name: "Real usefulness",
    text: "A clear purpose behind every product, grounded in what people need.",
    icon: Sparkles,
  },
];

export function AboutRunly() {
  return (
    <div className="about-page">
      <section className="about-hero" aria-labelledby="about-title">
        <div className="about-hero-art" aria-hidden="true">
          <Image
            src="/brand/runly-logo.png"
            alt=""
            width={1312}
            height={1199}
          />
        </div>
        <div className="about-hero-copy">
          <p>RUNLY / LUNARGROUP</p>
          <h1 id="about-title">Built with purpose.</h1>
          <span>The company and people behind Runly.</span>
        </div>
      </section>
      <section className="about-story" aria-labelledby="company-title">
        <div>
          <span className="about-eyebrow">ABOUT LUNARGROUP</span>
          <h2 id="company-title">
            Runly is built
            <br />
            by LunarGroup.
          </h2>
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
        </div>
      </section>
      <section className="about-principles" aria-labelledby="principles-title">
        <span className="about-eyebrow">OUR APPROACH</span>
        <h2 id="principles-title">
          Move fast. Stay focused.
          <br />
          Make products worth using.
        </h2>
        <p>We build with a simple approach.</p>
        <div className="principle-grid">
          {principles.map(({ name, text, icon: Icon }) => (
            <article key={name}>
              <span className="principle-icon">
                <Icon size={20} strokeWidth={1.5} aria-hidden="true" />
              </span>
              <h3>{name}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="about-team-section" aria-labelledby="team-title">
        <div className="about-team-heading">
          <div>
            <span className="about-eyebrow">OUR TEAM</span>
            <h2 id="team-title">
              The people
              <br />
              behind the purpose.
            </h2>
          </div>
          <p>
            Product vision.
            <br />
            Technical foundations.
            <br />
            Community connection.
            <br />
            One shared direction.
          </p>
        </div>
        <div className="about-team">
          {people.map((person) => (
            <article className="person-card" key={person.name}>
              <div className="person-identity">
                <span className="person-role">LUNARGROUP / {person.role}</span>
                <h3>{person.name}</h3>
                <p>{person.focus}</p>
              </div>
              <div className="person-biography">
                {person.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="about-invitation">
        <span className="about-eyebrow">MEET THE PRODUCT</span>
        <h2>That focus is Runly.</h2>
        <p>A place to turn an idea into something worth using.</p>
        <Link href="/#product">Explore Runly</Link>
      </section>
    </div>
  );
}
