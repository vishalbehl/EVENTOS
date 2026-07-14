import { UseFormSetError, FieldValues, Path } from "react-hook-form";
import { ApiError } from "./api-client";

/**
 * Utility to map RFC 9457 API problem details validation errors onto react-hook-form fields.
 * @param error The ApiError containing the problem detail validation dictionary
 * @param setError The setError function returned by react-hook-form's useForm hook
 */
export function mapApiErrorsToForm<TFieldValues extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<TFieldValues>
): boolean {
  if (!(error instanceof ApiError) || !error.problem?.errors) {
    return false;
  }

  const { errors } = error.problem;
  let mapped = false;

  Object.entries(errors).forEach(([field, messages]) => {
    // Determine the field path (matching name of react-hook-form control)
    const fieldName = field as Path<TFieldValues>;
    
    // Message can be a string or a string array
    const message = Array.isArray(messages)
      ? messages[0]
      : typeof messages === "string"
      ? messages
      : "Invalid value";

    if (message) {
      setError(fieldName, {
        type: "server",
        message,
      });
      mapped = true;
    }
  });

  return mapped;
}
