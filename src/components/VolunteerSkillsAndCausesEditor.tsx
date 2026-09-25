"use client";

import { FormEvent, useEffect, useState } from "react";

const SKILLS = [
  "Administration",
  "Community outreach",
  "Event planning",
  "First aid",
  "Fundraising",
  "Graphic design",
  "Leadership",
  "Marketing",
  "Mentoring",
  "Photography",
  "Project management",
  "Public speaking",
  "Social media",
  "Teaching",
  "Translation",
  "Web development",
];

const CAUSES = [
  "Animal welfare",
  "Arts and culture",
  "Children and youth",
  "Community development",
  "Disaster relief",
  "Education",
  "Environment",
  "Food security",
  "Health and wellbeing",
  "Homelessness",
  "Human rights",
  "Mental health",
  "Older adults",
  "Poverty reduction",
  "Refugee support",
  "Women and girls",
];

type VolunteerPreferences = {
  skills: string[];
  causes: string[];
};

export function VolunteerSkillsAndCausesEditor() {
  const [skills, setSkills] = useState<string[]>([]);
  const [causes, setCauses] = useState<string[]>([]);
  const [customSkill, setCustomSkill] = useState("");
  const [customCause, setCustomCause] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    async function loadPreferences() {
      try {
        setError("");
        const response = await fetch("/api/volunteer/profile/skills-causes");
        if (!response.ok) throw new Error("Unable to load skills and causes.");
        const data: VolunteerPreferences = await response.json();
        setSkills(Array.isArray(data.skills) ? data.skills : []);
        setCauses(Array.isArray(data.causes) ? data.causes : []);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Something went wrong."
        );
      } finally {
        setIsLoading(false);
      }
    }

    void loadPreferences();
  }, []);

  function toggleSelection(
    value: string,
    selected: string[],
    update: (values: string[]) => void
  ) {
    update(
      selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value]
    );
  }

  function addCustom(
    value: string,
    selected: string[],
    update: (values: string[]) => void,
    clear: () => void
  ) {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (!selected.some((item) => item.toLowerCase() === trimmed.toLowerCase())) {
      update([...selected, trimmed]);
    }
    clear();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccessMessage("");
    setIsSaving(true);

    try {
      const response = await fetch("/api/volunteer/profile/skills-causes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skills, causes }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.message ?? "Unable to save skills and causes.");
      }
      setSuccessMessage("Your skills and causes have been updated.");
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Something went wrong."
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <p role="status" className="text-sm text-slate-600">Loading selections...</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <p role="alert" className="alert-error text-sm">
          {error}
        </p>
      )}
      {successMessage && (
        <p role="status" className="alert-info text-sm">
          {successMessage}
        </p>
      )}

      <SelectionSection
        title="Your skills"
        description="Choose the skills you can offer."
        options={SKILLS}
        selectedValues={skills}
        customValue={customSkill}
        customPlaceholder="Add another skill"
        onCustomValueChange={setCustomSkill}
        onToggle={(skill) => toggleSelection(skill, skills, setSkills)}
        onAddCustom={() =>
          addCustom(customSkill, skills, setSkills, () => setCustomSkill(""))
        }
        onRemoveCustom={(skill) =>
          setSkills((current) => current.filter((value) => value !== skill))
        }
      />

      <SelectionSection
        title="Causes you care about"
        description="Choose the causes that are most meaningful to you."
        options={CAUSES}
        selectedValues={causes}
        customValue={customCause}
        customPlaceholder="Add another cause"
        onCustomValueChange={setCustomCause}
        onToggle={(cause) => toggleSelection(cause, causes, setCauses)}
        onAddCustom={() =>
          addCustom(customCause, causes, setCauses, () => setCustomCause(""))
        }
        onRemoveCustom={(cause) =>
          setCauses((current) => current.filter((value) => value !== cause))
        }
      />

      <button
        type="submit"
        disabled={isSaving || isLoading}
        className="rounded-lg bg-teal-800 px-4 py-3 text-sm font-semibold text-white hover:bg-teal-900 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSaving ? "Saving..." : "Save skills and causes"}
      </button>
    </form>
  );
}

type SelectionSectionProps = {
  title: string;
  description: string;
  options: string[];
  selectedValues: string[];
  customValue: string;
  customPlaceholder: string;
  onCustomValueChange: (value: string) => void;
  onToggle: (value: string) => void;
  onAddCustom: () => void;
  onRemoveCustom: (value: string) => void;
};

function SelectionSection({
  title,
  description,
  options,
  selectedValues,
  customValue,
  customPlaceholder,
  onCustomValueChange,
  onToggle,
  onAddCustom,
  onRemoveCustom,
}: SelectionSectionProps) {
  const customValues = selectedValues.filter((value) => !options.includes(value));

  return (
    <fieldset className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <legend className="px-1 text-lg font-semibold text-slate-900">{title}</legend>
      <p className="mt-1 text-sm text-slate-600">{description}</p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {options.map((option) => {
          const isSelected = selectedValues.includes(option);
          return (
            <label
              key={option}
              className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border p-3 transition ${
                isSelected
                  ? "border-teal-600 bg-teal-50"
                  : "border-slate-200 hover:border-slate-400"
              }`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggle(option)}
                className="size-5 shrink-0 accent-teal-700"
              />
              <span className="text-sm font-medium text-slate-800">{option}</span>
            </label>
          );
        })}
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <label className="sr-only" htmlFor={`${title}-custom-entry`}>
          {customPlaceholder}
        </label>
        <input
          id={`${title}-custom-entry`}
          type="text"
          value={customValue}
          onChange={(event) => onCustomValueChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onAddCustom();
            }
          }}
          placeholder={customPlaceholder}
          className="form-input min-w-0 flex-1"
        />
        <button
          type="button"
          onClick={onAddCustom}
          disabled={!customValue.trim()}
          className="min-h-12 rounded-lg border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add
        </button>
      </div>

      {customValues.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2" aria-label={`Custom ${title.toLowerCase()}`}>
          {customValues.map((value) => (
            <li key={value}>
              <button
                type="button"
                onClick={() => onRemoveCustom(value)}
                aria-label={`Remove ${value}`}
                className="min-h-11 rounded-full bg-teal-100 px-3 py-1 text-sm font-medium text-teal-900 hover:bg-teal-200"
              >
                {value} <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}