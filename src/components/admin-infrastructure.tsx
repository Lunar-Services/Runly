"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import {
  defaultSwiftlet,
  isInfrastructureMock,
  swiftletSchema,
  nestSchema,
  swiftletSettingsKey,
  nestsKey,
  saveConfiguration,
  useSwiftletSettings,
  useNests,
  type SwiftletSettings,
  type Nest,
} from "./admin-infrastructure-state";
import shared from "./admin-dashboard.module.css";
import styles from "./admin-infrastructure.module.css";
import { CountryIndicator, CountryPicker } from "./admin-country-picker";
import { getCountry } from "@/lib/countries";

type Errors = Record<string, string>;
type SwiftletForm = { [K in keyof SwiftletSettings]: string };
type NestForm = {
  id: string;
  name: string;
  endpoint: string;
  countryCode: string;
  maxEggs: string;
  status: Nest["status"];
};
const toSwiftletForm = (value: SwiftletSettings): SwiftletForm => ({
  endpoint: value.endpoint,
  scheduling: value.scheduling,
  maxEggs: String(value.maxEggs),
  idleMinutes: String(value.idleMinutes),
  heartbeatSeconds: String(value.heartbeatSeconds),
  provisioningSeconds: String(value.provisioningSeconds),
});
const toNestForm = (value: Nest): NestForm => ({
  ...value,
  maxEggs: String(value.maxEggs),
});

function DevelopmentNote() {
  if (!isInfrastructureMock) return null;
  return (
    <p className={styles.developmentNote}>
      Development mode. Mock data and changes are saved in this browser.
    </p>
  );
}
function Field({
  label,
  name,
  help,
  error,
  children,
  optional = false,
}: {
  label: string;
  name: string;
  help?: string;
  error?: string;
  children: ReactNode;
  optional?: boolean;
}) {
  return (
    <div className={styles.field}>
      <label htmlFor={name}>
        {label}
        {optional && <span>Optional</span>}
      </label>
      {children}
      {help && <p id={`${name}-help`}>{help}</p>}
      {error && (
        <p className={styles.fieldError} id={`${name}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}
function fieldDescription(name: string, error: string | undefined) {
  return `${name}-help${error ? ` ${name}-error` : ""}`;
}
function TokenField({ name, label }: { name: string; label: string }) {
  return (
    <Field
      name={name}
      label={label}
      help={
        isInfrastructureMock
          ? "Authentication is simulated in development."
          : "API authentication is not configured."
      }
    >
      <input
        id={name}
        name={name}
        type="password"
        disabled
        placeholder={isInfrastructureMock ? "Mock token" : "Not configured"}
        autoComplete="new-password"
        spellCheck={false}
        aria-describedby={`${name}-help`}
      />
    </Field>
  );
}
function errorFields(issues: { path: PropertyKey[]; message: string }[]) {
  return Object.fromEntries(
    issues.map((issue) => [String(issue.path[0]), issue.message]),
  );
}
function focusField(form: HTMLFormElement, field: PropertyKey | undefined) {
  const element = field && form.elements.namedItem(String(field));
  if (element instanceof HTMLElement) element.focus();
}

export function AdminSwiftlet() {
  const saved = useSwiftletSettings();
  const [editing, setEditing] = useState<SwiftletForm | null>(null);
  const form = editing ?? toSwiftletForm(saved);
  const [errors, setErrors] = useState<Errors>({});
  const [feedback, setFeedback] = useState("");
  const [failed, setFailed] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(toSwiftletForm(saved));
  function change(name: keyof SwiftletForm, value: string) {
    setEditing({ ...form, [name]: value });
    setErrors((current) => ({ ...current, [name]: "" }));
    setFeedback("");
  }
  function discard() {
    setEditing(null);
    setErrors({});
    setFailed(false);
    setFeedback("Changes discarded.");
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = swiftletSchema.safeParse({
      ...form,
      endpoint: form.endpoint.trim(),
      maxEggs: Number(form.maxEggs),
      idleMinutes: Number(form.idleMinutes),
      heartbeatSeconds: Number(form.heartbeatSeconds),
      provisioningSeconds: Number(form.provisioningSeconds),
    });
    if (!result.success) {
      setErrors(errorFields(result.error.issues));
      setFeedback("Check the highlighted fields.");
      setFailed(true);
      focusField(event.currentTarget, result.error.issues[0]?.path[0]);
      return;
    }
    try {
      saveConfiguration(swiftletSettingsKey, result.data);
      setEditing(null);
      setErrors({});
      setFailed(false);
      setFeedback("Swiftlet settings saved.");
    } catch {
      setFailed(true);
      setFeedback(
        "Unable to save changes. Your changes are still in the form.",
      );
    }
  }
  const numberField = (
    name: keyof SwiftletForm,
    label: string,
    help: string,
    min: number,
    max: number,
  ) => (
    <Field name={name} label={label} help={help} error={errors[name]}>
      <input
        id={name}
        name={name}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={form[name]}
        onChange={(e) => change(name, e.target.value)}
        aria-invalid={Boolean(errors[name])}
        aria-describedby={fieldDescription(name, errors[name])}
      />
    </Field>
  );
  return (
    <div className={styles.infrastructure}>
      <DevelopmentNote />
      <form
        noValidate
        onSubmit={submit}
        className={`${shared.panel} ${styles.swiftletForm}`}
      >
        <div className={styles.configurationColumns}>
          <section
            className={styles.connection}
            aria-labelledby="swiftlet-connection"
          >
            <div className={styles.sectionHeading}>
              <div>
                <h2 id="swiftlet-connection">Connection</h2>
                <p>How Perch reaches your Swiftlet service.</p>
              </div>
              <span
                className={`${shared.badge} ${isInfrastructureMock && saved.endpoint ? shared.good : shared.neutral}`}
              >
                {isInfrastructureMock && saved.endpoint
                  ? "Connected"
                  : "Not connected"}
              </span>
            </div>
            <Field
              name="endpoint"
              label="Service URL"
              optional
              help="The base URL of the Swiftlet API."
              error={errors.endpoint}
            >
              <input
                id="endpoint"
                name="endpoint"
                type="url"
                value={form.endpoint}
                onChange={(e) => change("endpoint", e.target.value)}
                placeholder="https://swiftlet.example.com"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={Boolean(errors.endpoint)}
                aria-describedby={fieldDescription("endpoint", errors.endpoint)}
              />
            </Field>
            <TokenField name="swiftlet-token" label="API token" />
          </section>
          <section
            className={styles.placement}
            aria-labelledby="swiftlet-placement"
          >
            <div className={styles.sectionHeading}>
              <div>
                <h2 id="swiftlet-placement">Placement</h2>
                <p>How Swiftlet assigns new Eggs to Nests.</p>
              </div>
            </div>
            <Field
              name="scheduling"
              label="Scheduling policy"
              help="Choose which Nest receives the next Egg."
            >
              <select
                id="scheduling"
                name="scheduling"
                value={form.scheduling}
                onChange={(e) => change("scheduling", e.target.value)}
                aria-describedby="scheduling-help"
              >
                <option value="least-occupied">Least occupied Nest</option>
                <option value="round-robin">Round robin</option>
                <option value="available-memory">Most available memory</option>
              </select>
            </Field>
            {numberField(
              "maxEggs",
              "Default Egg limit per Nest",
              "Starting capacity for newly added Nests.",
              1,
              500,
            )}
          </section>
        </div>
        <section
          className={styles.lifecycle}
          aria-labelledby="swiftlet-lifecycle"
        >
          <div className={styles.sectionHeading}>
            <div>
              <h2 id="swiftlet-lifecycle">Lifecycle</h2>
              <p>When to pause idle Eggs and consider a Nest unavailable.</p>
            </div>
          </div>
          <div className={styles.threeColumns}>
            {numberField(
              "idleMinutes",
              "Egg idle timeout (minutes)",
              "Pause an Egg after this long without activity.",
              1,
              1440,
            )}
            {numberField(
              "heartbeatSeconds",
              "Nest heartbeat timeout (seconds)",
              "Mark a Nest unavailable after missed heartbeats.",
              10,
              600,
            )}
            {numberField(
              "provisioningSeconds",
              "Egg startup timeout (seconds)",
              "Allow this long for an Egg to become ready.",
              30,
              3600,
            )}
          </div>
        </section>
        <div className={styles.saveBar}>
          <p
            className={failed ? styles.feedbackError : styles.feedback}
            role={failed ? "alert" : "status"}
          >
            {feedback ||
              (!isInfrastructureMock
                ? "Swiftlet service is not configured."
                : dirty
                  ? "Unsaved changes"
                  : "No unsaved changes")}
          </p>
          <div>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={discard}
              disabled={!dirty}
            >
              Discard changes
            </button>
            <button
              type="submit"
              className={shared.primaryButton}
              disabled={!dirty || !isInfrastructureMock}
            >
              Save settings
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function NestDialog({
  title,
  description,
  children,
  onClose,
  initialFocus,
}: {
  title: string;
  description: string;
  children: ReactNode;
  onClose: () => void;
  initialFocus: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const trigger = document.activeElement;
    element?.showModal();
    element?.querySelector<HTMLElement>(initialFocus)?.focus();
    return () => {
      element?.close();
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus();
      else document.getElementById("admin-add-nest")?.focus();
    };
  }, [initialFocus]);
  return (
    <dialog
      ref={dialog}
      className={`${shared.dialog} ${styles.dialog}`}
      onCancel={onClose}
      aria-labelledby="nest-dialog-title"
      aria-describedby="nest-dialog-description"
    >
      <div className={`${shared.dialogHeading} ${styles.modalHeading}`}>
        <div>
          <h2 id="nest-dialog-title">{title}</h2>
          <p id="nest-dialog-description" className={styles.dialogDescription}>
            {description}
          </p>
        </div>
        <button
          type="button"
          className={shared.iconButton}
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function NestEditor({
  initial,
  records,
  isNew,
  onSave,
  onClose,
}: {
  initial: Nest;
  records: Nest[];
  isNew: boolean;
  onSave: (nest: Nest) => string | null;
  onClose: () => void;
}) {
  const [form, setForm] = useState(toNestForm(initial));
  const [errors, setErrors] = useState<Errors>({});
  const [feedback, setFeedback] = useState("");
  function change(name: keyof NestForm, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: "" }));
    setFeedback("");
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = nestSchema.safeParse({
      ...initial,
      ...form,
      maxEggs: Number(form.maxEggs),
    });
    if (!result.success) {
      setErrors(errorFields(result.error.issues));
      focusField(event.currentTarget, result.error.issues[0]?.path[0]);
      return;
    }
    const duplicate = records.find(
      (nest) =>
        nest.id !== initial.id &&
        (nest.endpoint === result.data.endpoint ||
          nest.name.toLowerCase() === result.data.name.toLowerCase()),
    );
    if (duplicate) {
      const field =
        duplicate.endpoint === result.data.endpoint ? "endpoint" : "name";
      setErrors({
        [field]:
          field === "endpoint"
            ? "A Nest with this URL already exists."
            : "Use a different Nest name.",
      });
      focusField(event.currentTarget, field);
      return;
    }
    const error = onSave(result.data);
    if (error) setFeedback(error);
  }
  return (
    <NestDialog
      title={isNew ? "Add Nest" : "Edit Nest"}
      description="Configure the daemon endpoint and capacity for this Nest."
      onClose={onClose}
      initialFocus='input[name="name"]'
    >
      <form noValidate onSubmit={submit} className={styles.nestForm}>
        <div className={styles.dialogBody}>
          <Field name="name" label="Nest name" error={errors.name}>
            <input
              id="name"
              name="name"
              value={form.name}
              maxLength={80}
              onChange={(e) => change("name", e.target.value)}
              placeholder="singapore-01"
              autoComplete="off"
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? "name-error" : undefined}
            />
          </Field>
          <Field
            name="endpoint"
            label="Daemon URL"
            help="The base URL where Swiftlet will reach this Nest."
            error={errors.endpoint}
          >
            <input
              id="endpoint"
              name="endpoint"
              type="url"
              value={form.endpoint}
              onChange={(e) => change("endpoint", e.target.value)}
              placeholder="https://nest-01.example.com:9443"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={Boolean(errors.endpoint)}
              aria-describedby={fieldDescription("endpoint", errors.endpoint)}
            />
          </Field>
          <div className={styles.twoColumns}>
            <Field
              name="countryCode"
              label="Country"
              optional
              error={errors.countryCode}
            >
              <CountryPicker
                value={form.countryCode}
                onChange={(code) => change("countryCode", code)}
                error={errors.countryCode}
              />
            </Field>
            <Field
              name="maxEggs"
              label="Maximum Eggs"
              help="Overrides the Swiftlet default for this Nest."
              error={errors.maxEggs}
            >
              <input
                id="maxEggs"
                name="maxEggs"
                type="number"
                min={1}
                max={500}
                step={1}
                inputMode="numeric"
                value={form.maxEggs}
                onChange={(e) => change("maxEggs", e.target.value)}
                aria-invalid={Boolean(errors.maxEggs)}
                aria-describedby={fieldDescription("maxEggs", errors.maxEggs)}
              />
            </Field>
          </div>
          {feedback && (
            <p className={styles.feedbackError} role="alert">
              {feedback}
            </p>
          )}
        </div>
        <div className={styles.dialogActions}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onClose}
          >
            Cancel
          </button>
          <button type="submit" className={shared.primaryButton}>
            {isNew ? "Add Nest" : "Save changes"}
          </button>
        </div>
      </form>
    </NestDialog>
  );
}

function UsageMeter({ value, label }: { value: number | null; label: string }) {
  if (value === null)
    return (
      <span
        className={styles.unavailable}
        title="Telemetry unavailable"
        aria-label={`${label} unavailable`}
      >
        —
      </span>
    );
  return (
    <div
      className={`${styles.usageMeter} ${value >= 80 ? styles.usageHigh : ""}`}
      role="meter"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span>{value}%</span>
      <span className={styles.usageTrack} aria-hidden="true">
        <span style={{ width: `${value}%` }} />
      </span>
    </div>
  );
}

export function AdminNests({ query }: { query: string }) {
  const records = useNests();
  const swiftlet = useSwiftletSettings();
  const [editor, setEditor] = useState<{
    nest: Nest;
    isNew: boolean;
  } | null>(null);
  const [removing, setRemoving] = useState<Nest | null>(null);
  const [feedback, setFeedback] = useState("");
  const [failed, setFailed] = useState(false);
  const filtered = records.filter((nest) =>
    [
      nest.name,
      nest.endpoint,
      nest.countryCode,
      getCountry(nest.countryCode)?.name || "",
    ]
      .join(" ")
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  function add() {
    setFeedback("");
    setEditor({
      isNew: true,
      nest: {
        id: crypto.randomUUID(),
        name: "",
        endpoint: "",
        countryCode: "",
        maxEggs: swiftlet.maxEggs || defaultSwiftlet.maxEggs,
        status: "pending",
        activeEggs: null,
        cpuPercent: null,
        ramPercent: null,
      },
    });
  }
  function save(nest: Nest) {
    const updated = records.some((item) => item.id === nest.id);
    try {
      saveConfiguration(
        nestsKey,
        updated
          ? records.map((item) => (item.id === nest.id ? nest : item))
          : [...records, nest],
      );
      setEditor(null);
      setFailed(false);
      setFeedback(updated ? "Nest updated." : "Nest added.");
      return null;
    } catch {
      return "Unable to save changes. Your changes are still in the form.";
    }
  }
  function remove() {
    if (!removing) return;
    try {
      saveConfiguration(
        nestsKey,
        records.filter((nest) => nest.id !== removing.id),
      );
      setRemoving(null);
      setFailed(false);
      setFeedback("Nest removed.");
    } catch {
      setFailed(true);
      setFeedback("Unable to remove the Nest. Please try again.");
      setRemoving(null);
    }
  }
  return (
    <div className={styles.infrastructure}>
      <DevelopmentNote />
      <section
        className={`${shared.panel} ${styles.nestsPanel}`}
        aria-labelledby="nest-registry-heading"
      >
        <div className={shared.panelHeading}>
          <div>
            <h2 id="nest-registry-heading">Nests</h2>
            <p>
              {records.length} {records.length === 1 ? "Nest" : "Nests"} in your
              fleet
            </p>
          </div>
          <button
            type="button"
            id="admin-add-nest"
            className={`${shared.primaryButton} ${styles.addButton}`}
            onClick={add}
            disabled={records.length >= 250 || !isInfrastructureMock}
          >
            <Plus size={16} aria-hidden="true" />
            Add Nest
          </button>
        </div>
        {records.length ? (
          <>
            <div className={shared.tableScroll}>
              <table className={`${shared.table} ${styles.nestsTable}`}>
                <caption className={shared.srOnly}>Nests</caption>
                <thead>
                  <tr>
                    <th scope="col">Nest</th>
                    <th scope="col">Country</th>
                    <th scope="col">Active Eggs</th>
                    <th scope="col">CPU usage</th>
                    <th scope="col">RAM usage</th>
                    <th scope="col">Status</th>
                    <th scope="col">
                      <span className={shared.srOnly}>Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((nest) => (
                    <tr key={nest.id}>
                      <td>
                        <strong className={styles.nestName}>{nest.name}</strong>
                      </td>
                      <td>
                        <CountryIndicator code={nest.countryCode} />
                      </td>
                      <td>
                        <span
                          className={styles.eggCount}
                          aria-label={`${nest.status === "offline" || nest.activeEggs === null ? "Active Eggs unavailable" : `${nest.activeEggs} active Eggs`} of ${nest.maxEggs} capacity`}
                        >
                          {nest.status === "offline"
                            ? "—"
                            : (nest.activeEggs ?? "—")}
                          <span> / {nest.maxEggs}</span>
                        </span>
                      </td>
                      <td>
                        <UsageMeter
                          value={
                            nest.status === "offline" ? null : nest.cpuPercent
                          }
                          label="CPU usage"
                        />
                      </td>
                      <td>
                        <UsageMeter
                          value={
                            nest.status === "offline" ? null : nest.ramPercent
                          }
                          label="RAM usage"
                        />
                      </td>
                      <td>
                        <span
                          className={`${shared.badge} ${nest.status === "online" ? shared.good : nest.status === "draining" ? shared.warning : shared.neutral}`}
                        >
                          {nest.status === "online"
                            ? "Online"
                            : nest.status === "draining"
                              ? "Draining"
                              : nest.status === "offline"
                                ? "Offline"
                                : "Pending"}
                        </span>
                      </td>
                      <td>
                        <div className={styles.rowActions}>
                          <button
                            type="button"
                            className={shared.rowAction}
                            aria-label={`Edit ${nest.name}`}
                            onClick={() => setEditor({ nest, isNew: false })}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            type="button"
                            className={shared.rowAction}
                            aria-label={`Remove ${nest.name}`}
                            onClick={() => setRemoving(nest)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!filtered.length && (
                    <tr>
                      <td colSpan={7}>
                        <div className={shared.empty}>
                          <strong>No matching Nests</strong>
                          <p>
                            Try a different name, URL, or country in the search
                            above.
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className={styles.registryFooter}>
              {filtered.length} of {records.length}{" "}
              {records.length === 1 ? "Nest" : "Nests"} shown.
            </p>
          </>
        ) : (
          <div className={styles.registryEmpty}>
            <h3>No Nests added</h3>
            <p>
              {isInfrastructureMock
                ? "Add a Nest with its daemon URL and Egg capacity."
                : "Connect Swiftlet to add and manage Nests."}
            </p>
          </div>
        )}
        <p
          role={failed ? "alert" : "status"}
          className={failed ? styles.feedbackError : styles.feedback}
        >
          {feedback}
        </p>
      </section>
      {editor && (
        <NestEditor
          key={editor.nest.id}
          initial={editor.nest}
          isNew={editor.isNew}
          records={records}
          onSave={save}
          onClose={() => setEditor(null)}
        />
      )}
      {removing && (
        <NestDialog
          title={`Remove ${removing.name}?`}
          description="Remove this Nest from the fleet? The VPS and its Docker containers will remain on the server."
          onClose={() => setRemoving(null)}
          initialFocus='button[data-cancel="true"]'
        >
          <div className={styles.dialogActions}>
            <button
              type="button"
              className={styles.secondaryButton}
              data-cancel="true"
              onClick={() => setRemoving(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className={styles.removeButton}
              onClick={remove}
            >
              Remove Nest
            </button>
          </div>
        </NestDialog>
      )}
    </div>
  );
}
