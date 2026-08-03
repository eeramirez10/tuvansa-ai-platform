export enum AiJobStatus {
  QUEUED = "queued",
  PROCESSING = "processing",
  COMPLETED = "completed",
  FAILED = "failed",
  CANCELLED = "cancelled",
  NEEDS_REVIEW = "needs_review",
}

export enum AiJobType {
  QUOTE_TEXT_EXTRACTION = "quote_text_extraction",
  QUOTE_DOCUMENT_EXTRACTION = "quote_document_extraction",
  QUOTED_EXCEL_EXTRACTION = "quoted_excel_extraction",
  SUPPLIER_QUOTE_EXTRACTION = "supplier_quote_extraction",
  SEMANTIC_SEARCH = "semantic_search",
  VECTOR_CATALOG_SYNC = "vector_catalog_sync",
  TECHNICAL_DATA_SUGGESTION = "technical_data_suggestion",
}

export interface AiJobProps {
  id: string;
  type: AiJobType;
  status: AiJobStatus;
  progress: number;
  idempotencyKey: string;
  inputHash: string;
  input: unknown;
  result: unknown | null;
  errorCode: string | null;
  errorMessage: string | null;
  promptVersion: string | null;
  attempts: number;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}

export class AiJob {
  constructor(private readonly props: AiJobProps) {}

  public get id(): string { return this.props.id; }
  public get type(): AiJobType { return this.props.type; }
  public get status(): AiJobStatus { return this.props.status; }
  public get progress(): number { return this.props.progress; }
  public get input(): unknown { return this.props.input; }
  public get result(): unknown | null { return this.props.result; }
  public get errorCode(): string | null { return this.props.errorCode; }
  public get errorMessage(): string | null { return this.props.errorMessage; }
  public get promptVersion(): string | null { return this.props.promptVersion; }
  public get attempts(): number { return this.props.attempts; }
  public get createdAt(): Date { return this.props.createdAt; }
  public get updatedAt(): Date { return this.props.updatedAt; }
  public get startedAt(): Date | null { return this.props.startedAt; }
  public get completedAt(): Date | null { return this.props.completedAt; }
}
