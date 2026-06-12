export type ProfileSection = 'my'|'history'|'favorites'|'cart'|'purchases'|'sales'|'reviews'|'myReviews'

type ProfileTabsProps = {
  active: ProfileSection
  pendingReviewCount: number
  onSelect: (section: ProfileSection) => void
}

const tabs: Array<{ section: ProfileSection; label: string; review?: boolean }> = [
  { section: 'my', label: 'Мої оголошення' },
  { section: 'history', label: 'Історія перегляду' },
  { section: 'favorites', label: 'Обране' },
  { section: 'cart', label: 'Кошик' },
  { section: 'purchases', label: 'Мої покупки' },
  { section: 'sales', label: 'Мої продажі' },
  { section: 'reviews', label: 'Залишити відгук', review: true },
  { section: 'myReviews', label: 'Мої відгуки' }
]

export default function ProfileTabs({ active, pendingReviewCount, onSelect }: ProfileTabsProps) {
  return (
    <div className='profile-tabs' style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:10}}>
      {tabs.map((tab) => (
        <button
          key={tab.section}
          className={`${active === tab.section ? 'active' : ''}${tab.review ? ' review-tab' : ''}`}
          onClick={() => onSelect(tab.section)}
        >
          {tab.label} {tab.review && pendingReviewCount > 0 && <b className='tab-badge'>{pendingReviewCount}</b>}
        </button>
      ))}
    </div>
  )
}
