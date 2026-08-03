import { ProductAvailabilityPort } from "../application/ports/product-availability.port";
import {
  ProductAvailability,
  ProductAvailabilityCurrency,
  ProductBranchAvailability,
  ProductCodeAvailability,
} from "../domain/semantic-catalog.types";

export class ErpProductAvailabilityHttpAdapter implements ProductAvailabilityPort {
  constructor(
    private readonly baseUrl: string | undefined,
    private readonly timeoutMs: number,
    private readonly apiKey?: string,
  ) {}

  public isEnabled(): boolean {
    return Boolean(this.baseUrl?.trim());
  }

  public async findByEans(eans: string[]): Promise<ProductAvailability[]> {
    if (!this.isEnabled() || eans.length === 0) return [];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(
        `${this.baseUrl!.trim().replace(/\/+$/, "")}/availability/batch`,
        {
          method: "POST",
          signal: controller.signal,
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            ...(this.apiKey ? { "x-internal-api-key": this.apiKey } : {}),
          },
          body: JSON.stringify({ eans }),
        },
      );
      if (!response.ok) {
        throw new Error(`ERP availability service returned HTTP ${response.status}.`);
      }
      const payload = await response.json() as unknown;
      if (!payload || typeof payload !== "object" || !Array.isArray((payload as { items?: unknown }).items)) {
        throw new Error("ERP availability service returned an invalid response.");
      }
      return ((payload as { items: unknown[] }).items)
        .map((item) => this.parseItem(item))
        .filter((item): item is ProductAvailability => item !== null);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("ERP availability service timed out.");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseItem(input: unknown): ProductAvailability | null {
    if (!input || typeof input !== "object") return null;
    const item = input as Record<string, unknown>;
    const ean = this.text(item.ean);
    if (!ean) return null;
    const costs = this.object(item.costs);
    return {
      ean,
      productCode: this.text(item.productCode),
      sourceProductCodes: Array.isArray(item.sourceProductCodes)
        ? item.sourceProductCodes.map((value) => this.text(value)).filter(Boolean)
        : [],
      hasMultipleProductCodes: Boolean(item.hasMultipleProductCodes),
      description: this.text(item.description),
      unit: this.text(item.unit),
      costs: {
        average: this.number(costs.average),
        last: this.number(costs.last),
        currency: this.currency(costs.currency),
      },
      totalStock: this.number(item.totalStock),
      availableInAnyBranch: Boolean(item.availableInAnyBranch),
      branches: this.branches(item.branches),
      codes: Array.isArray(item.codes)
        ? item.codes.map((code) => this.parseCode(code)).filter((code): code is ProductCodeAvailability => code !== null)
        : [],
    };
  }

  private parseCode(input: unknown): ProductCodeAvailability | null {
    if (!input || typeof input !== "object") return null;
    const code = input as Record<string, unknown>;
    const icod = this.text(code.icod);
    if (!icod) return null;
    const costs = this.object(code.costs);
    return {
      icod,
      homeBranchCode: this.nullableText(code.homeBranchCode),
      homeBranchName: this.nullableText(code.homeBranchName),
      description: this.text(code.description),
      unit: this.text(code.unit),
      costs: {
        average: this.number(costs.average),
        last: this.number(costs.last),
        currency: this.currency(costs.currency),
      },
      totalStock: this.number(code.totalStock),
      availableInAnyBranch: Boolean(code.availableInAnyBranch),
      branches: this.branches(code.branches),
    };
  }

  private branches(input: unknown): ProductBranchAvailability[] {
    if (!Array.isArray(input)) return [];
    return input.flatMap((value) => {
      if (!value || typeof value !== "object") return [];
      const branch = value as Record<string, unknown>;
      const branchCode = this.text(branch.branchCode);
      if (!branchCode) return [];
      const stock = this.number(branch.stock);
      return [{
        branchCode,
        branchName: this.text(branch.branchName),
        stock,
        available: stock > 0,
      }];
    });
  }

  private object(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" ? value as Record<string, unknown> : {};
  }

  private text(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
  }

  private nullableText(value: unknown): string | null {
    return this.text(value) || null;
  }

  private number(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private currency(value: unknown): ProductAvailabilityCurrency {
    return String(value).toUpperCase() === "USD" ? "USD" : "MXN";
  }
}
