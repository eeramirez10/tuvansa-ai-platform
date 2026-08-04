import { Request, Response } from "express";
import { SearchSemanticCatalogUseCase } from "../application/use-cases/search-semantic-catalog.use-case";
import { SemanticCatalogPresenter } from "./semantic-catalog.presenter";
import { SemanticSearchRequestDto } from "./semantic-search-request.dto";

export class SemanticCatalogController {
  constructor(
    private readonly searchCatalog: SearchSemanticCatalogUseCase,
    private readonly indexName: string,
  ) {}

  public vectorSearch = async (req: Request, res: Response): Promise<void> => {
    const request = SemanticSearchRequestDto.fromVectorSearch(req.body).props;
    const result = await this.searchCatalog.execute({
      query: request.query,
      candidateTopK: request.candidateTopK,
      limit: request.limit,
      filters: request.filters,
      includeAvailability: true,
      availabilityWarehouseCodes: request.warehouseCodes,
    });
    res.status(200).json(SemanticCatalogPresenter.vectorSearch(this.indexName, request, result));
  };

  public hybridVectorSearch = async (req: Request, res: Response): Promise<void> => {
    const request = SemanticSearchRequestDto.fromVectorSearch(req.body).props;
    const result = await this.searchCatalog.executeHybrid({
      query: request.query,
      candidateTopK: request.candidateTopK,
      limit: request.limit,
      filters: request.filters,
      includeAvailability: true,
      availabilityWarehouseCodes: request.warehouseCodes,
    });
    res.status(200).json(SemanticCatalogPresenter.hybridVectorSearch(this.indexName, request, result));
  };

  public quoteSearch = async (req: Request, res: Response): Promise<void> => {
    const request = SemanticSearchRequestDto.fromQuoteSearch(req.body).props;
    const result = await this.searchCatalog.execute({
      query: request.query,
      candidateTopK: request.candidateTopK,
      limit: request.limit,
      filters: request.filters,
      includeAvailability: true,
      availabilityWarehouseCodes: request.warehouseCodes,
    });
    res.status(200).json(SemanticCatalogPresenter.quoteSearch(this.indexName, request, result));
  };

  public hybridQuoteSearch = async (req: Request, res: Response): Promise<void> => {
    const request = SemanticSearchRequestDto.fromQuoteSearch(req.body).props;
    const result = await this.searchCatalog.executeHybrid({
      query: request.query,
      candidateTopK: request.candidateTopK,
      limit: request.limit,
      filters: request.filters,
      includeAvailability: true,
      availabilityWarehouseCodes: request.warehouseCodes,
    });
    res.status(200).json(SemanticCatalogPresenter.hybridQuoteSearch(this.indexName, request, result));
  };
}
