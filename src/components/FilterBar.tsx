import { Search } from 'lucide-react'
import type { TimeRangeKey } from '../types'
import { timeRangeLabels } from '../lib/trends'

interface FilterBarProps {
  query: string
  region: string
  shipType: string
  category: string
  timeRange: TimeRangeKey
  detainedOnly: boolean
  regions: string[]
  shipTypes: string[]
  categories: string[]
  onQueryChange: (value: string) => void
  onRegionChange: (value: string) => void
  onShipTypeChange: (value: string) => void
  onCategoryChange: (value: string) => void
  onTimeRangeChange: (value: TimeRangeKey) => void
  onDetainedOnlyChange: (value: boolean) => void
  onReset: () => void
}

export function FilterBar(props: FilterBarProps) {
  return (
    <div className="filter-bar" aria-label="案例篩選">
      <label className="search-field">
        <Search size={18} />
        <span className="sr-only">搜尋船名或 IMO 編號</span>
        <input value={props.query} onChange={(event) => props.onQueryChange(event.target.value)} placeholder="搜尋船名、IMO、摘要" />
      </label>
      <label className="select-field"><span className="sr-only">地區</span><select value={props.region} onChange={(event) => props.onRegionChange(event.target.value)}><option value="">全部地區</option>{props.regions.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label className="select-field"><span className="sr-only">時間段</span><select value={props.timeRange} onChange={(event) => props.onTimeRangeChange(event.target.value as TimeRangeKey)}>{Object.entries(timeRangeLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
      <label className="select-field"><span className="sr-only">船型</span><select value={props.shipType} onChange={(event) => props.onShipTypeChange(event.target.value)}><option value="">船型</option>{props.shipTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label className="select-field"><span className="sr-only">缺陷類別</span><select value={props.category} onChange={(event) => props.onCategoryChange(event.target.value)}><option value="">缺陷類別</option>{props.categories.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label className="checkbox-field"><input type="checkbox" checked={props.detainedOnly} onChange={(event) => props.onDetainedOnlyChange(event.target.checked)} /><span>只看滯留/GFD</span></label>
      <button className="primary-button" type="button" onClick={props.onReset}>重設篩選</button>
    </div>
  )
}
