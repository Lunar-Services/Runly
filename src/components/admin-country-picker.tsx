"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Globe2 } from "lucide-react";
import { countries, getCountry } from "@/lib/countries";
import "flag-icons/css/flag-icons.min.css";
import styles from "./admin-infrastructure.module.css";

export function CountryFlag({ code }: { code: string }) {
  return code ? (
    <span
      aria-hidden="true"
      className={`fi fi-${code.toLowerCase()} ${styles.countryFlag}`}
    />
  ) : (
    <Globe2 size={20} aria-hidden="true" />
  );
}

export function CountryIndicator({ code }: { code: string }) {
  const country = getCountry(code);
  const name = country?.name || "Country not specified";
  return (
    <span
      className={styles.countryIndicator}
      tabIndex={0}
      role="img"
      aria-label={name}
      title={name}
    >
      <CountryFlag code={country?.code || ""} />
      <span className={styles.countryTooltip} aria-hidden="true">
        {name}
      </span>
    </span>
  );
}

export function CountryPicker({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const container = useRef<HTMLDivElement>(null);
  const selected = getCountry(value);
  const normalized = query.trim().toLowerCase();
  const options = countries.filter((country) =>
    `${country.name} ${country.code} ${country.code === "US" ? "USA America" : country.code === "GB" ? "UK Britain" : ""}`
      .toLowerCase()
      .includes(normalized),
  );
  const items = normalized
    ? options
    : [{ code: "", name: "Not specified" }, ...options];
  const activeId = `nest-country-${items[active]?.code || "none"}`;

  useEffect(() => {
    if (open)
      container.current
        ?.querySelector<HTMLElement>(`#${activeId}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [open, activeId]);

  function choose(code: string) {
    onChange(code);
    setOpen(false);
    setQuery("");
  }

  return (
    <div
      className={styles.countryPicker}
      ref={container}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setOpen(false);
      }}
    >
      <div className={styles.countryInput}>
        <CountryFlag code={value} />
        <input
          id="countryCode"
          name="countryCode"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls="nest-country-options"
          aria-activedescendant={open && items.length ? activeId : undefined}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "countryCode-error" : undefined}
          autoComplete="off"
          spellCheck={false}
          value={open ? query : selected?.name || ""}
          placeholder={open ? "Search countries…" : "Select country"}
          onFocus={() => {
            setOpen(true);
            setQuery("");
            setActive(0);
          }}
          onClick={() => {
            if (!open) {
              setOpen(true);
              setQuery("");
              setActive(0);
            }
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && open) {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
            } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
              setActive((current) =>
                Math.max(
                  0,
                  Math.min(
                    items.length - 1,
                    current + (event.key === "ArrowDown" ? 1 : -1),
                  ),
                ),
              );
            } else if (event.key === "Enter" && open) {
              event.preventDefault();
              if (items[active]) choose(items[active].code);
            } else if (event.key === "Tab") setOpen(false);
          }}
        />
        <ChevronDown
          size={16}
          className={styles.countryChevron}
          aria-hidden="true"
        />
      </div>
      {open && (
        <div
          className={styles.countryOptions}
          role="listbox"
          id="nest-country-options"
          aria-label="Countries"
        >
          {items.map((country, index) => (
            <div
              key={country.code}
              role="option"
              id={`nest-country-${country.code || "none"}`}
              aria-selected={country.code === value}
              className={`${styles.countryOption} ${index === active ? styles.countryOptionActive : ""}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(country.code)}
            >
              <CountryFlag code={country.code} />
              <span>{country.name}</span>
              {country.code === value && <Check size={14} aria-hidden="true" />}
            </div>
          ))}
          {!options.length && (
            <p className={styles.countryNoResults} role="status">
              No countries found.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
