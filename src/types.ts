export type CaseStatus = 'detained' | 'released' | 'clear'
export type EvidenceLevel = 'narrative' | 'official-summary' | 'index-only' | 'full-dossier'
export type TimeRangeKey = '3m' | '6m' | '1y' | 'all'
export type FindingPriority = 'low' | 'medium' | 'high'

export interface Deficiency {
  code: string
  category: string
  original: string
  observedCondition?: string
  inspectorFinding?: string
  detentionReason?: string
  requiredRectification?: string
  releaseCondition?: string
  sourcePage?: string
  sourceQuote?: string
  detentionGround: boolean | null
  notes?: string
  priority?: FindingPriority
  novel?: boolean
  updatedAt?: string
}

export interface OfficialSource {
  authority: string
  title: string
  url: string
  publishedAt: string
  sourceType: string
}

export interface InspectionCase {
  id: string
  vessel: string
  imo: string
  flag: string
  flagEmoji: string
  shipType: string
  built: number | null
  gt: number | null
  company: string
  classSociety: string
  date: string
  releaseDate: string | null
  port: string
  mou: 'Paris MoU' | 'Tokyo MoU' | 'USCG' | 'Other'
  region: string
  deficiencyCount: number
  detentionGroundCount: number
  status: CaseStatus
  evidenceLevel: EvidenceLevel
  shortSummary: string
  narrative: string[]
  deficiencies: Deficiency[]
  source: OfficialSource
  evidenceNote: string
  fetchedAt?: string
}

export interface SourceBookmark {
  id: string
  title: string
  url: string
  sourceType: string
  addedAt: string
  manual: boolean
  notes?: string
  authority?: string
  updatedAt?: string
  deletedAt?: string
  deletedBy?: string
  deleteReason?: string
  publishedAt?: string
  fetchedAt?: string
  evidenceLevel?: EvidenceLevel
  autoFetch?: SourceAutoFetch
  status?: 'new' | 'queued' | 'downloaded' | 'analysis-ready' | 'failed' | 'archived'
  tags?: string[]
  storageUrl?: string
  pdfArchivedAt?: string
}

export type SourceAutoFetch = 'enabled' | 'partial' | 'manual' | 'restricted'

export interface OfficialSourceGuide {
  id: string
  region: string
  authority: string
  title: string
  url: string
  evidenceLevel: EvidenceLevel
  updateCadence: string
  bestUse: string
  limitations: string
  nextAction: string
  autoFetch: SourceAutoFetch
  refreshScope: string
}

export interface TrendSummary {
  range: TimeRangeKey
  region: string
  totalCases: number
  totalDetainableDeficiencies: number
  analysisReadyCases: number
  indexOnlyCases: number
  topCategories: Array<{ category: string; count: number; cases: string[] }>
  topAuthorities: Array<{ authority: string; count: number }>
  regionBreakdown: Array<{ region: string; cases: number; detainable: number; indexOnly: number; analysisReady: number }>
  evidenceMix: Array<{ level: EvidenceLevel; count: number }>
  statusBreakdown: Array<{ status: CaseStatus; count: number }>
  monthlyTrend: Array<{ month: string; cases: number; detainable: number }>
  categoryRegionMatrix: Array<{ category: string; region: string; count: number }>
  topKeywords: Array<{ keyword: string; count: number }>
  prioritySignals: string[]
  typicalCases: InspectionCase[]
  focusDirections: string[]
}
