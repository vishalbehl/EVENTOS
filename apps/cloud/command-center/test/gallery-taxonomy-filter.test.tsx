import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FormTemplateGallery } from "../../../../packages/form-builder-studio/src/components/FormTemplateGallery";
import { DEFAULT_FORM_TEMPLATES } from "../../../../packages/form-builder-studio/src/templates";
import type { FormCategory, FormTemplate } from "../../../../packages/form-builder-studio/src/types";

afterEach(cleanup);

const categories: FormCategory[] = [
  { id: "canonical-id", name: "Original taxonomy", slug: "registration", is_system: true, is_active: true, sort_order: 0 },
  { id: "replacement-id", name: "Reassigned taxonomy", slug: "reviewed-custom", is_system: true, is_active: true, sort_order: 1 },
];
const templates: FormTemplate[] = [
  { ...DEFAULT_FORM_TEMPLATES[0], id: "original", name: "Original registration blueprint", category_id: "canonical-id", category_key: "registration" },
  { ...DEFAULT_FORM_TEMPLATES[0], id: "reassigned", name: "Reassigned registration blueprint", category_id: "replacement-id", category_key: "registration" },
  { ...DEFAULT_FORM_TEMPLATES[0], id: "legacy", name: "Legacy unbound registration blueprint", category_id: null, category_key: "registration" },
];

describe("purpose and display taxonomy", () => {
  it("filters owned taxonomy by exact category ID rather than shared purpose or display text", () => {
    render(<FormTemplateGallery templates={templates} categories={categories} />);
    fireEvent.click(screen.getByRole("button", { name: "Reassigned taxonomy" }));
    expect(screen.getByText("Reassigned registration blueprint")).toBeInTheDocument();
    expect(screen.queryByText("Original registration blueprint")).not.toBeInTheDocument();
    expect(screen.queryByText("Legacy unbound registration blueprint")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Original taxonomy" }));
    expect(screen.getByText("Original registration blueprint")).toBeInTheDocument();
    expect(screen.getByText("Legacy unbound registration blueprint")).toBeInTheDocument();
    expect(screen.queryByText("Reassigned registration blueprint")).not.toBeInTheDocument();
  });

  it("keeps the facility's operational templates visible after taxonomy reassignment", () => {
    render(<FormTemplateGallery templates={templates} categories={categories} facilityCategory="registration" />);
    expect(screen.getByText("Original registration blueprint")).toBeInTheDocument();
    expect(screen.getByText("Reassigned registration blueprint")).toBeInTheDocument();
  });

  it("accepts the documented speaker aliases but excludes other operational purposes", () => {
    const sources: FormTemplate[] = [
      { ...templates[1], id: "legacy-speaker", name: "Legacy speaker blueprint", category_key: "speaker" },
      { ...templates[1], id: "speaker-intake", name: "Speaker intake blueprint", category_key: "speaker_intake" },
      templates[1],
    ];
    render(<FormTemplateGallery templates={sources} categories={categories} facilityCategory="speaker_intake" />);
    expect(screen.getByText("Legacy speaker blueprint")).toBeInTheDocument();
    expect(screen.getByText("Speaker intake blueprint")).toBeInTheDocument();
    expect(screen.queryByText("Reassigned registration blueprint")).not.toBeInTheDocument();
  });
});
