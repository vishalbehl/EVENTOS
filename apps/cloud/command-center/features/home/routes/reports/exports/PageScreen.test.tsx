import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  refreshExports: vi.fn(),
  refreshOrganizations: vi.fn(),
}))

vi.mock("@/services/super-admin-service", () => ({
  downloadCommercialExport: vi.fn(),
  useAdminOrgs: () => ({
    data: [{ id: "org-1", name: "Conference Org" }],
    isError: false,
    refetch: mocks.refreshOrganizations,
  }),
  useCommercialExports: () => ({
    data: [],
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: mocks.refreshExports,
  }),
  useCreateCommercialExport: () => ({
    mutate: mocks.create,
    isPending: false,
    variables: undefined,
  }),
}))

import ReportsExportsPage from "./PageScreen"

describe("ReportsExportsPage", () => {
  beforeEach(() => {
    vi.stubGlobal("crypto", { randomUUID: () => "request-id" })
  })

  it("requires organization scope and an audit reason before queueing", () => {
    render(<ReportsExportsPage />)

    const generateButtons = screen.getAllByRole("button", { name: /generate report/i })
    expect(generateButtons).toHaveLength(4)
    expect(generateButtons[0]).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/organization scope/i), { target: { value: "org-1" } })
    fireEvent.change(screen.getByLabelText(/audit reason/i), {
      target: { value: "Quarterly pricing review" },
    })

    expect(generateButtons[0]).toBeEnabled()
    fireEvent.click(generateButtons[0])
    expect(mocks.create).toHaveBeenCalledWith({
      reportType: "hardware_catalog",
      reason: "Quarterly pricing review",
      idempotencyKey: "commercial-export-request-id",
    })
  })

  it("does not render fabricated export records", () => {
    render(<ReportsExportsPage />)
    expect(screen.queryByText(/Item A/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/downloaded successfully/i)).not.toBeInTheDocument()
  })
})
