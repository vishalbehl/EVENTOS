import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Skeleton, CardSkeleton, TableSkeleton } from "./LoadingSkeleton";

describe("LoadingSkeleton", () => {
  it("renders basic skeleton component", () => {
    render(<Skeleton className="h-4 w-4" />);
    expect(screen.getByTestId("skeleton")).toBeInTheDocument();
  });

  it("renders card skeleton layout", () => {
    render(<CardSkeleton />);
    expect(screen.getByTestId("card-skeleton")).toBeInTheDocument();
  });

  it("renders table skeleton structure with rows and columns", () => {
    render(<TableSkeleton rows={3} cols={2} />);
    expect(screen.getByTestId("table-skeleton")).toBeInTheDocument();
  });
});
