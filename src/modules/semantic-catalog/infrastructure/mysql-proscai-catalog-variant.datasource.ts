import mysql, { Pool } from "mysql2/promise";
import { ProscaiCatalogVariantDatasource } from "../domain/datasources/proscai-catalog-variant.datasource";
import {
  ProscaiBranchCode,
  ProscaiCatalogVariantSourceRecord,
} from "../domain/entities/proscai-catalog-variant.entity";

type SourceRow = {
  iseq: number;
  ean: string;
  icod: string;
  branchCode: ProscaiBranchCode;
  description1: string;
  description2: string;
  fam2: string;
  fam3: string;
  fam4: string;
  fam5: string;
  fam7: string;
  fam8: string;
  famc: string;
  unit: string;
  isInactive: number;
  sourceUpdatedAt: Date | null;
  disabledAt: Date | null;
};

const BRANCH_NAMES: Record<ProscaiBranchCode, string> = {
  "01": "MEXICO",
  "02": "MONTERREY",
  "03": "VERACRUZ",
  "04": "MEXICALI",
  "05": "QUERETARO",
  "06": "CANCUN",
  "07": "LOS CABOS",
};

export class MysqlProscaiCatalogVariantDatasource extends ProscaiCatalogVariantDatasource {
  private readonly pool: Pool;

  constructor(config: { host: string; user: string; password: string; database: string }) {
    super();
    this.pool = mysql.createPool({
      ...config,
      connectionLimit: 4,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10_000,
    });
  }

  public async findAllSourceRecords(): Promise<ProscaiCatalogVariantSourceRecord[]> {
    const [rows] = await this.pool.query(`
      WITH long_descriptions AS (
        SELECT I2KEY, MAX(NULLIF(TRIM(I2DESCR), '')) AS description2
        FROM FINV2
        GROUP BY I2KEY
      )
      SELECT
        FINV.ISEQ AS iseq,
        UPPER(TRIM(FINV.IEAN)) AS ean,
        FINV.ICOD AS icod,
        LEFT(FINV.ICOD, 2) AS branchCode,
        TRIM(FINV.IDESCR) AS description1,
        COALESCE(long_descriptions.description2, '') AS description2,
        COALESCE(FAM2.FAMDESCR, '') AS fam2,
        COALESCE(FAM3.FAMDESCR, '') AS fam3,
        COALESCE(FAM4.FAMDESCR, '') AS fam4,
        COALESCE(FAM5.FAMDESCR, '') AS fam5,
        COALESCE(FAM7.FAMDESCR, '') AS fam7,
        COALESCE(FAM8.FAMDESCR, '') AS fam8,
        COALESCE(FAMC.FAMDESCR, '') AS famc,
        COALESCE(FUNIDAD.UDESCR, '') AS unit,
        FINV.IINACTIVO AS isInactive,
        FINV.IFECHACAMBIO AS sourceUpdatedAt,
        FINV.IBAJA AS disabledAt
      FROM FINV
      LEFT JOIN long_descriptions ON long_descriptions.I2KEY = FINV.ISEQ
      LEFT JOIN FFAM AS FAM2 ON FAM2.FAMTNUM = FINV.IFAM2
      LEFT JOIN FFAM AS FAM3 ON FAM3.FAMTNUM = FINV.IFAM3
      LEFT JOIN FFAM AS FAM4 ON FAM4.FAMTNUM = FINV.IFAM4
      LEFT JOIN FFAM AS FAM5 ON FAM5.FAMTNUM = FINV.IFAM5
      LEFT JOIN FFAM AS FAM7 ON FAM7.FAMTNUM = FINV.IFAM7
      LEFT JOIN FFAM AS FAM8 ON FAM8.FAMTNUM = FINV.IFAM8
      LEFT JOIN FFAM AS FAMC ON FAMC.FAMTNUM = FINV.IFAMC
      LEFT JOIN FUNIDAD ON FUNIDAD.UCOD = FINV.IUM
      WHERE FINV.ITIPO = 1
        AND LEFT(FINV.ICOD, 2) IN ('01', '02', '03', '04', '05', '06', '07')
      ORDER BY UPPER(TRIM(FINV.IEAN)) ASC, FINV.ICOD ASC, FINV.ISEQ ASC
    `);

    return (rows as SourceRow[]).map((row) => {
      const description1 = row.description1?.trim() ?? "";
      const description2 = row.description2?.trim() ?? "";
      return {
        iseq: Number(row.iseq),
        ean: row.ean?.trim() || undefined,
        icod: row.icod,
        branchCode: row.branchCode,
        branchName: BRANCH_NAMES[row.branchCode],
        description1,
        description2,
        originalDescription: description2 || description1,
        fam2: row.fam2?.trim() ?? "",
        fam3: row.fam3?.trim() ?? "",
        fam4: row.fam4?.trim() ?? "",
        fam5: row.fam5?.trim() ?? "",
        fam7: row.fam7?.trim() ?? "",
        fam8: row.fam8?.trim() ?? "",
        famc: row.famc?.trim() ?? "",
        unit: row.unit?.trim() ?? "",
        isActive: Number(row.isInactive) === 0,
        sourceUpdatedAt: this.isoDate(row.sourceUpdatedAt),
        disabledAt: this.isoDate(row.disabledAt, true),
      };
    });
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }

  private isoDate(value: Date | null, ignoreLegacy = false): string | undefined {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) return undefined;
    if (ignoreLegacy && value.getUTCFullYear() <= 1900) return undefined;
    return value.toISOString();
  }
}
