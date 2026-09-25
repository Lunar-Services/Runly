import styles from "./code-card.module.css";

export function CodeCard() {
  return (
    <div
      className={styles.card}
      role="img"
      aria-label="Illustrative Hello World code sample"
    >
      <div className={styles.top} aria-hidden="true">
        <div className={styles.dots}>
          <span className={styles.dotBlue} />
          <span className={styles.dotViolet} />
          <span className={styles.dotGreen} />
        </div>
        <span className={styles.prompt}>&gt;_</span>
      </div>
      <pre className={styles.code} aria-hidden="true">
        <code>
          <span className={styles.red}>function</span>{" "}
          <span className={styles.violet}>helloWorld</span>
          <span className={styles.blue}>(</span>
          <span className={styles.orange}>text</span>
          <span className={styles.blue}>){"{"}</span>
          {"\n"}
          {"  "}
          <span className={styles.red}>for</span>
          <span className={styles.orange}>(</span>
          <span className={styles.red}>let</span>{" "}
          <span className={styles.white}>i</span>{" "}
          <span className={styles.red}>=</span>{" "}
          <span className={styles.blue}>0</span>
          <span className={styles.white}>; i</span>{" "}
          <span className={styles.red}>&lt;</span>{" "}
          <span className={styles.blue}>10</span>
          <span className={styles.white}>; i</span>
          <span className={styles.red}>++</span>
          <span className={styles.orange}>){"{"}</span>
          {"\n"}
          {"    "}
          <span className={styles.blue}>console</span>
          <span className={styles.white}>.</span>
          <span className={styles.violet}>log</span>
          <span className={styles.blue}>(`{"${"}</span>
          <span className={styles.orange}>text</span>
          <span className={styles.blue}>{"}"}`)</span>
          <span className={styles.white}>;</span>
          {"\n"}
          {"  "}
          <span className={styles.orange}>{"}"}</span>
          {"\n"}
          <span className={styles.blue}>{"}"}</span>
          {"\n\n"}
          <span className={styles.violet}>helloWorld</span>
          <span className={styles.blue}>(&apos;Hello World&apos;)</span>
          <span className={styles.white}>;</span>
        </code>
      </pre>
    </div>
  );
}
