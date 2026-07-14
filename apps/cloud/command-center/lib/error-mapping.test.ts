import { describe, expect, it, vi } from "vitest";
import { mapApiErrorsToForm } from "./error-mapping";
import { ApiError } from "./api-client";

describe("mapApiErrorsToForm", () => {
  it("returns false if error is not an ApiError instance", () => {
    const setError = vi.fn();
    const result = mapApiErrorsToForm(new Error("regular error"), setError);
    expect(result).toBe(false);
    expect(setError).not.toHaveBeenCalled();
  });

  it("returns false if ApiError contains no problem validation errors", () => {
    const setError = vi.fn();
    const apiError = new ApiError({
      message: "Bad request",
      status: 400,
      code: "BAD_REQUEST",
    });
    const result = mapApiErrorsToForm(apiError, setError);
    expect(result).toBe(false);
    expect(setError).not.toHaveBeenCalled();
  });

  it("maps field errors from problem details dictionary onto form", () => {
    const setError = vi.fn();
    const apiError = new ApiError({
      message: "Validation failed",
      status: 422,
      code: "VALIDATION_ERROR",
      problem: {
        errors: {
          username: ["Username is already taken."],
          email: "Enter a valid email address.",
          age: ["Must be older than 18.", "Must be integer."],
        },
      },
    });

    const result = mapApiErrorsToForm(apiError, setError);
    expect(result).toBe(true);
    expect(setError).toHaveBeenCalledTimes(3);
    expect(setError).toHaveBeenNthCalledWith(1, "username", {
      type: "server",
      message: "Username is already taken.",
    });
    expect(setError).toHaveBeenNthCalledWith(2, "email", {
      type: "server",
      message: "Enter a valid email address.",
    });
    expect(setError).toHaveBeenNthCalledWith(3, "age", {
      type: "server",
      message: "Must be older than 18.",
    });
  });
});
