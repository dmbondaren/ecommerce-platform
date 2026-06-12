import React, { FC, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import LoginForm from './components/LoginFrom'
import ChatModalFrame from './components/ChatModalFrame'
import ErrorMessage from './components/ErrorMessage'
import ImageUploadGrid from './components/ImageUploadGrid'
import ListingTile from './components/ListingTile'
import ProfileTabs, { ProfileSection } from './components/ProfileTabs'
import { Context } from './index'
import { observer } from 'mobx-react-lite'
import html2canvas from 'html2canvas'
import { IListing } from './models/IListing'
import ListingService, { ChatSummary, ComplaintItem, SearchStat, SellerReview } from './services/ListingService'
import UserService, { AdminUserDetails, IUserProfile, PublicUserProfile } from './services/UserService'
import { CATEGORIES, SUPPORTED_CURRENCIES, getEmptyCategoryMessage, getListingCategoryExamples, hasListingFormErrors, validateListingForm } from './utils/listing-form'
import { isNearBottom } from './utils/chat-ui'
import { createArchivedListing } from './utils/archived-listing'
import { getCategoryTotal, getPositiveCategoryEntries } from './utils/profile-stats'
import './App.css'

type View = 'home'|'listing'|'profile'|'checkout'|'about'|'sellerProfile'
type ListingFilters = { minPrice: string; maxPrice: string; category: string; sortBy: string }

const defaultForm = { title: '', description: '', price: '', currency: 'UAH', location: '', phone: '', category: '' }
const defaultFilters: ListingFilters = { minPrice: '', maxPrice: '', category: '', sortBy: 'newest' }

const currencyCode = (value?: string) => String(value || 'UAH').toUpperCase()
const listingPriceInCurrency = (item: Partial<IListing>, targetCurrency: string, rates: Record<string, number>) => {
  const fromRate = rates[currencyCode(item.currency)] || 1
  const toRate = rates[currencyCode(targetCurrency)] || 1
  return (Number(item.price || 0) * fromRate) / toRate
}
const createdTime = (item: Partial<IListing>) => new Date(item.createdAt || 0).getTime() || 0
const listingViews = (item: Partial<IListing>) => Number((item as any).viewCount || 0)
const applyListingFilters = (items: IListing[], filters: ListingFilters, targetCurrency: string, rates: Record<string, number>, search = '') => {
  const query = search.trim().toLowerCase()
  const min = Number(filters.minPrice)
  const max = Number(filters.maxPrice)
  const hasMin = filters.minPrice !== '' && Number.isFinite(min)
  const hasMax = filters.maxPrice !== '' && Number.isFinite(max)

  return [...items]
    .filter((item) => {
      if (query && !String(item.title || '').toLowerCase().includes(query)) return false
      if (filters.category && item.category !== filters.category) return false
      const price = listingPriceInCurrency(item, targetCurrency, rates)
      if (hasMin && price < min) return false
      if (hasMax && price > max) return false
      return true
    })
    .sort((a, b) => {
      const newest = createdTime(b) - createdTime(a)
      if (filters.sortBy === 'oldest') return createdTime(a) - createdTime(b)
      if (filters.sortBy === 'price_asc') return listingPriceInCurrency(a, targetCurrency, rates) - listingPriceInCurrency(b, targetCurrency, rates) || newest
      if (filters.sortBy === 'price_desc') return listingPriceInCurrency(b, targetCurrency, rates) - listingPriceInCurrency(a, targetCurrency, rates) || newest
      if (filters.sortBy === 'popular_asc') return listingViews(a) - listingViews(b) || newest
      if (filters.sortBy === 'popular_desc') return listingViews(b) - listingViews(a) || newest
      return newest
    })
}

const App: FC = () => {
  const { store } = useContext(Context)
  const [view,setView]=useState<View>('home')
  const [listings, setListings] = useState<IListing[]>([])
  const [categories, setCategories] = useState<string[]>(CATEGORIES)
  const [currentListing, setCurrentListing] = useState<IListing | null>(null)
  const [profile, setProfile] = useState<IUserProfile | null>(null)
  const [currencyRates, setCurrencyRates] = useState<Record<string, number>>({UAH:1,USD:41,EUR:45})
  const [search, setSearch] = useState('')
  const [focused, setFocused] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [showAuth, setShowAuth] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [editing, setEditing] = useState<IListing | null>(null)
  const [toDelete, setToDelete] = useState<IListing | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const [topSearches, setTopSearches] = useState<SearchStat[]>([])
  const [error, setError] = useState('')
  const [form, setForm] = useState(defaultForm)
  const [imageSlots, setImageSlots] = useState<(File | null)[]>([null, null, null, null, null, null])
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [draggingFrom, setDraggingFrom] = useState<number | null>(null)
  const [filters, setFilters] = useState<ListingFilters>(defaultFilters)
  const [appliedFilters, setAppliedFilters] = useState<ListingFilters>(defaultFilters)
  const [activeDetailImage, setActiveDetailImage] = useState(0)
  const [formErrors, setFormErrors] = useState<{ [k: string]: boolean }>({})
  const [isDraggingImage, setIsDraggingImage] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [chatTab, setChatTab] = useState<'sell'|'buy'>('sell')
  const [chatRoom, setChatRoom] = useState('')
  const [chatInput, setChatInput] = useState('')
  const [chatAttachments, setChatAttachments] = useState<File[]>([])
  const [supportSection, setSupportSection] = useState<'chat'|'complaints'>('chat')
  const [chatSummary, setChatSummary] = useState<ChatSummary | null>(null)
  const [complaints, setComplaints] = useState<ComplaintItem[]>([])
  const [problemSelectorOpen, setProblemSelectorOpen] = useState(false)
  const [problemTarget, setProblemTarget] = useState<'support'|'complaint'>('support')
  const [problemRect, setProblemRect] = useState({ x: 120, y: 120, w: 320, h: 180 })
  const [dragProblem, setDragProblem] = useState<{ mode: 'move'|'right'|'bottom'|'left'|'top'|'corner'; startX: number; startY: number; rect: {x:number;y:number;w:number;h:number} } | null>(null)
  const [chatMessages, setChatMessages] = useState<{id?:string;roomId:string;text:string;mine:boolean;nickname?:string;senderUserId?:string|null;senderIsAdmin?:boolean;senderIsActivated?:boolean;attachmentUrl?:string;attachmentName?:string;selectionJson?:string;createdAt?:string;editedAt?:string|null;deletedAt?:string|null;readAt?:string|null}[]>([])
  const [chatNotifications, setChatNotifications] = useState<Record<string, boolean>>({})
  const [chatThreads, setChatThreads] = useState<{ roomId: string; title: string; imageUrl: string; type: 'buy'|'sell'|'support'; canWrite: boolean; userId?: string | null; userTitle?: string; messageCount?: number; unreadCount?: number; inCart?: boolean; inFav?: boolean }[]>([])
  const [supportMode, setSupportMode] = useState(false)
  const [favoriteIds, setFavoriteIds] = useState<Record<string, boolean>>({})
  const [cartIds, setCartIds] = useState<Record<string, boolean>>({})
  const [socket, setSocket] = useState<WebSocket | null>(null)
  const chatRoomRef = useRef('')
  const viewRef = useRef<View>('home')
  const searchRef = useRef('')
  const appliedFiltersRef = useRef<ListingFilters>(defaultFilters)
  const selectedCurrencyRef = useRef('UAH')
  const currencyRatesRef = useRef<Record<string, number>>({UAH:1,USD:41,EUR:45})
  const chatMessagesContainerRef = useRef<HTMLDivElement | null>(null)
  const readMarkingRoomsRef = useRef<Record<string, boolean>>({})
  const shouldAutoScrollChatRef = useRef(false)
  const pinnedChatRef = useRef<{ roomId: string; type: 'buy'|'sell' } | null>(null)
  const chatSendLogRef = useRef<{ time: number; chars: number }[]>([])
  const complaintSendLogRef = useRef<{ time: number; chars: number }[]>([])
  const [clientId] = useState(() => Math.random().toString(36).slice(2))
  const [profileSection, setProfileSection] = useState<ProfileSection>('my')
  const [newNickname, setNewNickname] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [existingEditImages, setExistingEditImages] = useState<string[]>([])
  const [adminUsers, setAdminUsers] = useState<IUserProfile[]>([])
  const [selectedAdminUser, setSelectedAdminUser] = useState<AdminUserDetails | null>(null)
  const [adminBanMinutes, setAdminBanMinutes] = useState('60')
  const [adminBanReason, setAdminBanReason] = useState('')
  const [adminChatRoom, setAdminChatRoom] = useState('')
  const [adminDeleteTarget, setAdminDeleteTarget] = useState<{ listing: IListing; action: 'delete'|'deactivate'|'activate' } | null>(null)
  const [adminDeleteTitle, setAdminDeleteTitle] = useState('')
  const [adminDeleteReason, setAdminDeleteReason] = useState('')
  const [moderationListings, setModerationListings] = useState<IListing[]>([])
  const [sellerReviews, setSellerReviews] = useState<SellerReview[]>([])
  const [myReviewLists, setMyReviewLists] = useState<{received: SellerReview[]; given: SellerReview[]}>({ received: [], given: [] })
  const [replyDrafts, setReplyDrafts] = useState<Record<string,string>>({})
  const [purchaseReviewDrafts, setPurchaseReviewDrafts] = useState<Record<string,{rating:number;comment:string;pros:string;cons:string}>>({})
  const [pendingReviewCount, setPendingReviewCount] = useState(0)
  const [adminUserSearch, setAdminUserSearch] = useState('')
  const [highlightMessageId, setHighlightMessageId] = useState('')
  const [complaintText, setComplaintText] = useState('')
  const [complaintImages, setComplaintImages] = useState<File[]>([])
  const [showComplaint, setShowComplaint] = useState(false)
  const [checkoutItems, setCheckoutItems] = useState<IListing[]>([])
  const [publicProfile, setPublicProfile] = useState<PublicUserProfile | null>(null)
  const [editingMessageId, setEditingMessageId] = useState('')
  const [editingMessageText, setEditingMessageText] = useState('')
  const [appBusy, setAppBusy] = useState(false)

  const placeholder = useMemo(() => 'Пошук товарів', [])
  const requestErrorMessage = useCallback((e: any) => e?.response?.data?.message || (e?.message === 'Network Error' ? 'Сервер недоступний. Перевірте сервер на localhost:5000.' : 'Не вдалося завантажити дані'), [])
  useEffect(() => { viewRef.current = view }, [view])
  useEffect(() => { searchRef.current = search }, [search])
  useEffect(() => { appliedFiltersRef.current = appliedFilters }, [appliedFilters])
  useEffect(() => { selectedCurrencyRef.current = currencyCode(profile?.preferredCurrency) }, [profile?.preferredCurrency])
  useEffect(() => { currencyRatesRef.current = currencyRates }, [currencyRates])
  useEffect(() => {
    let alive = true
    ListingService.fetchCategories()
      .then((response) => {
        const next = response.data.filter(Boolean)
        if (alive && next.length) setCategories(next)
      })
      .catch(() => {
        if (alive) setCategories(CATEGORIES)
      })
    return () => { alive = false }
  }, [])
  const loadTop = useCallback(async () => {
    try {
      setTopSearches((await ListingService.fetchTopSearches(5)).data)
    } catch {
      setTopSearches([])
    }
  }, [])
  const loadListings = useCallback(async (s: string, nextFilters = appliedFilters, pushRoute = true) => {
    setAppBusy(true)
    try {
      setError(''); setView('home'); setCurrentListing(null)
      const serverFilters = {
        ...nextFilters,
        minPrice: '',
        maxPrice: '',
        sortBy: String(nextFilters.sortBy).startsWith('popular') ? nextFilters.sortBy : 'newest'
      }
      const rows = (await ListingService.fetchListings(s, serverFilters)).data
      setListings(applyListingFilters(rows, nextFilters, currencyCode(profile?.preferredCurrency), currencyRates, s))
      if (pushRoute) window.history.pushState({}, '', `/search?query=${encodeURIComponent(s)}`)
      await loadTop()
    } catch (e: any) {
      setListings([])
      setError(requestErrorMessage(e))
    } finally {
      setAppBusy(false)
    }
  }, [appliedFilters, currencyRates, loadTop, profile?.preferredCurrency, requestErrorMessage])
  useEffect(() => { if (localStorage.getItem('token')) store.checkAuth().catch(()=>null); const p=window.location.pathname; if (p.startsWith('/myaccount/profile')) { setView('profile'); if (store.isAuth) UserService.me().then(r=>setProfile(r.data)).catch(()=>null) } else if (p.startsWith('/users/') && p.endsWith('/profile')) { const id=p.split('/users/')[1]?.split('/profile')[0]; if(id) openSellerProfile(id).catch(()=>null) } else if (p.startsWith('/checkout')) { setView('checkout'); try { setCheckoutItems(JSON.parse(sessionStorage.getItem('checkoutItems') || '[]')) } catch {} } else if (p.startsWith('/listing/')) { const id=p.split('/listing/')[1]; if(id) openListing(id).catch(()=>null) } else loadListings('').catch(()=>null); loadTop().catch(()=>null) }, [store, loadListings, loadTop])

  useEffect(() => {
    if (!store.isAuth) return
    const p = window.location.pathname
      if (p.startsWith('/myaccount/profile')) {
      setView('profile')
      UserService.me().then(r => setProfile(r.data)).catch(()=>null)
      if (p.includes('/favorites')) ListingService.fetchFavorites().then(r=>{setProfileSection('favorites');setListings(r.data)}).catch(()=>null)
      else if (p.includes('/cart')) ListingService.fetchCart().then(r=>{setProfileSection('cart');setListings(r.data)}).catch(()=>null)
      else if (p.includes('/purchases')) ListingService.fetchPurchases().then(r=>{setProfileSection('purchases');setListings(r.data)}).catch(()=>null)
      else if (p.includes('/sales')) ListingService.fetchSales().then(r=>{setProfileSection('sales');setListings(r.data)}).catch(()=>null)
      else if (p.includes('/myReviews') || p.includes('/my-reviews')) ListingService.fetchMyReviews().then(r=>{setProfileSection('myReviews');setMyReviewLists(r.data);setListings([])}).catch(()=>null)
      else if (p.includes('/reviews')) ListingService.fetchPendingReviews().then(r=>{setProfileSection('reviews');setListings(r.data);setPendingReviewCount(r.data.length)}).catch(()=>null)
    }
  }, [store.isAuth])

  useEffect(() => {
    if (!store.isAuth) return
    ListingService.fetchFavorites().then(r => setFavoriteIds(Object.fromEntries(r.data.map(x => [x._id, true])))).catch(()=>null)
    ListingService.fetchCart().then(r => setCartIds(Object.fromEntries(r.data.map(x => [x._id, true])))).catch(()=>null)
    refreshPendingReviewCount()
  }, [store.isAuth])
  useEffect(() => { chatRoomRef.current = chatRoom }, [chatRoom])
  useEffect(() => {
    sessionStorage.setItem('checkoutItems', JSON.stringify(checkoutItems))
  }, [checkoutItems])
  useEffect(() => {
    if (!store.isAuth) return
    const tick = () => ListingService.fetchChatSummary().then(r=>setChatSummary(r.data)).catch(()=>null)
    tick()
    const id = window.setInterval(tick, 3000)
    return () => window.clearInterval(id)
  }, [store.isAuth])

  useEffect(() => {
    let alive = true
    const updateRates = async () => {
      try {
        const response = await fetch('https://kurstoday.com.ua/api/service/banks-of-ukraine')
        const data = await response.json()
        const exchangers = Array.isArray(data?.exchangers) ? data.exchangers : []
        const rates = exchangers.map((e:any)=>e?.rates).filter(Boolean)
        const pick = (key:string) => {
          const vals = rates.map((r:any)=>Number(r?.[key]?.sel || r?.[key]?.buy)).filter((n:number)=>Number.isFinite(n)&&n>0)
          return vals.length ? vals.reduce((a:number,b:number)=>a+b,0)/vals.length : 0
        }
        const usd = pick('usd')
        const eur = pick('eur')
        if (alive) setCurrencyRates(prev => ({ ...prev, UAH: 1, ...(usd ? { USD: usd } : {}), ...(eur ? { EUR: eur } : {}) }))
      } catch {}
    }
    updateRates()
    const id = window.setInterval(updateRates, 10 * 60 * 1000)
    return () => { alive = false; window.clearInterval(id) }
  }, [])
  const openArchivedListing = (item: any, id?: string | null, pushRoute = true) => {
    const listing = createArchivedListing(item, id)
    closeTransientPanels()
    setError('')
    setCurrentListing(listing)
    setSellerReviews([])
    setActiveDetailImage(0)
    setView('listing')
    if (pushRoute && listing._id && window.location.pathname !== `/listing/${listing._id}`) window.history.pushState({}, '', `/listing/${listing._id}`)
  }
  const openListing = async (id: string, fallbackSnapshot?: any, pushRoute = true) => {
    sessionStorage.setItem('lastScrollSnapshot', JSON.stringify({ path: window.location.pathname, scrollY: window.scrollY }))
    closeTransientPanels()
    setAppBusy(true)
    try {
      setError('')
      const item = (await ListingService.fetchListingById(id)).data
      if (store.isAuth) ListingService.addView(id).catch(()=>null)
      setCurrentListing(item)
      if (item.ownerId) setSellerReviews((await ListingService.fetchSellerReviews(item.ownerId)).data)
      setActiveDetailImage(0)
      setView('listing')
      if (pushRoute && window.location.pathname !== `/listing/${id}`) window.history.pushState({}, '', `/listing/${id}`)
    } catch (e:any) {
      if (fallbackSnapshot) {
        openArchivedListing(fallbackSnapshot, id, pushRoute)
        return
      }
      window.scrollTo({ top: 0, behavior: 'smooth' })
      setError(e?.response?.data?.message || 'Оголошення недоступне або вже видалене')
    } finally {
      setAppBusy(false)
    }
  }
  const downloadListingImagesPdf = (listing: IListing) => {
    const urls = (listing.imageUrls?.length ? listing.imageUrls : [listing.imageUrl]).filter(Boolean)
    const html = `<html><body>${urls.map((u)=>`<div style="page-break-after:always"><img src="${u}" style="width:100%"/></div>`).join('')}</body></html>`
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(html); w.document.close(); w.focus(); setTimeout(()=>w.print(), 500)
  }
  const refreshPendingReviewCount = async () => { if (store.isAuth) ListingService.fetchPendingReviews().then(r=>setPendingReviewCount(r.data.length)).catch(()=>null) }
  const closeTransientPanels = () => { setShowChat(false); setShowComplaint(false); setProblemSelectorOpen(false); setShowFilters(false); setFocused(false); setChatAttachments([]) }
  const openProfile = async (pushRoute = true) => { closeTransientPanels(); setError(''); if(!store.isAuth) return; setProfileSection('my'); setProfile((await UserService.me()).data); setListings((await ListingService.fetchMyListings()).data); refreshPendingReviewCount(); setView('profile'); if (pushRoute && window.location.pathname !== '/myaccount/profile') window.history.pushState({}, '', '/myaccount/profile') }
  const openProfileSection = async (section: ProfileSection, pushRoute = true) => {
    closeTransientPanels()
    setProfileSection(section)
    setView('profile')
    if (!profile) UserService.me().then(r=>setProfile(r.data)).catch(()=>null)
    if (section === 'my') setListings((await ListingService.fetchMyListings()).data)
    if (section === 'history') setListings((await ListingService.fetchHistory()).data)
    if (section === 'favorites') setListings((await ListingService.fetchFavorites()).data)
    if (section === 'cart') setListings((await ListingService.fetchCart()).data)
    if (section === 'purchases') setListings((await ListingService.fetchPurchases()).data)
    if (section === 'sales') setListings((await ListingService.fetchSales()).data)
    if (section === 'reviews') setListings((await ListingService.fetchPendingReviews()).data)
    if (section === 'myReviews') { const r = await ListingService.fetchMyReviews(); setMyReviewLists(r.data); setListings([]) }
    if (pushRoute && window.location.pathname !== `/myaccount/profile/${section}`) window.history.pushState({}, '', `/myaccount/profile/${section}`)
    focusElement('.profile-tabs')
  }
  const openSellerProfile = async (id: string, pushRoute = true) => {
    closeTransientPanels()
    setError('')
    const profileData = (await UserService.fetchPublicProfile(id)).data
    setPublicProfile(profileData)
    setSellerReviews((await ListingService.fetchSellerReviews(id)).data)
    setView('sellerProfile')
    if (pushRoute && window.location.pathname !== `/users/${id}/profile`) window.history.pushState({}, '', `/users/${id}/profile`)
  }

  const openEdit = (i: IListing) => {
    setError(''); setEditing(i); setShowForm(true)
    setForm({ title: i.title, description: i.description, price: String(i.price), currency: i.currency || 'UAH', location: i.location || '', phone: i.phone || '', category: i.category || '' })
    const existingUrls = (i.imageUrls && i.imageUrls.length ? i.imageUrls : [i.imageUrl]).filter(Boolean)
    setExistingEditImages(existingUrls)
    const existing = existingUrls.map(() => null)
    setImageSlots([...existing, null, null, null, null, null, null].slice(0, Math.max(6, existing.length + 1)))
    setTimeout(() => window.scrollTo({ top: 120, behavior: 'smooth' }), 50)
  }
  const openDelete = (i: IListing) => { setError(''); setToDelete(i); setConfirmText(''); setTimeout(()=>window.scrollTo({top:120,behavior:'smooth'}),40) }
  const confirmDelete = async () => { if (!toDelete) return; if (confirmText !== toDelete.title) return setError(`Щоб видалити, впишіть: ${toDelete.title}`); const deletedId = toDelete._id; await ListingService.deleteListing(deletedId); setToDelete(null); setListings(prev=>prev.filter(i=>i._id!==deletedId)); await openProfileSection('my') }
  const roleIcon = (isAdmin?: boolean, isActivated?: boolean) => isAdmin ? '/media/icons/star-admin.svg' : (isActivated ? '/media/icons/star-verification-user.svg' : '/media/icons/star_no-verification.png')
  const roleTitle = (isAdmin?: boolean, isActivated?: boolean) => isAdmin ? 'Адміністратор сайту' : (isActivated ? 'Пошта підтверджена' : 'Пошта не підтверджена')
  const roleClass = (isAdmin?: boolean, isActivated?: boolean) => isAdmin ? 'admin' : (isActivated ? 'auth' : 'noauth')
  const roleBadge = (isAdmin?: boolean, isActivated?: boolean, small = true) => <span className={`role-badge ${roleClass(isAdmin, isActivated)}`} data-tooltip={roleTitle(isAdmin, isActivated)}><img className={small ? 'mini-role-icon' : 'role-icon'} src={roleIcon(isAdmin, isActivated)} alt={roleTitle(isAdmin, isActivated)} /></span>
  const openUserProfileById = (id?: string | number | null) => {
    if (!id) return
    openSellerProfile(String(id)).catch((e:any)=>setError(e?.response?.data?.message || 'Не вдалося відкрити профіль користувача'))
  }
  const userNameLink = (userId?: string | number | null, label = 'Користувач', isAdmin?: boolean, isActivated?: boolean) => (
    <span className={'user-name-link '+(!userId ? 'disabled' : '')} data-profile-user-id={userId ? String(userId) : ''} role={userId ? 'button' : undefined} tabIndex={userId ? 0 : undefined} onKeyDown={userId ? (e)=>{ if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); openUserProfileById(userId) } } : undefined}>
      {roleBadge(isAdmin, isActivated)}
      <span>{label || 'Користувач'}</span>
    </span>
  )
  const listingStatusText = (listing: IListing) => {
    if (listing.status === 'pending') return 'На перевірці адміністратора'
    if (listing.status === 'deactivated') return 'Деактивовано'
    if (listing.status === 'sold' || listing.status === 'deleted') return 'Архівна картка'
    return ''
  }
  const handleProfileNameClick = (event: React.MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement
    const open = (id?: string | number | null) => {
      if (!id) return
      event.preventDefault()
      event.stopPropagation()
      openUserProfileById(id)
    }
    const directLink = target.closest('[data-profile-user-id]') as HTMLElement | null
    if (directLink?.dataset.profileUserId) { open(directLink.dataset.profileUserId); return }
    const chatAuthor = target.closest('.chat-msg small') as HTMLElement | null
    if (chatAuthor) {
      const msgId = (chatAuthor.closest('.chat-msg') as HTMLElement | null)?.dataset.messageId || ''
      const message = chatMessages.find(m => (m.id || '') === msgId)
      open(message?.senderUserId)
      return
    }
    const adminAuthor = target.closest('.admin-msg small') as HTMLElement | null
    if (adminAuthor && selectedAdminUser) {
      const msgNode = adminAuthor.closest('.admin-msg') as HTMLElement | null
      const logNode = adminAuthor.closest('.admin-chat-log') as HTMLElement | null
      const index = msgNode && logNode ? Array.from(logNode.querySelectorAll('.admin-msg')).indexOf(msgNode) : -1
      const message = selectedAdminUser.messages.filter(m => m.roomId === adminChatRoom)[index]
      open(message?.senderUserId)
      return
    }
    const partyLine = target.closest('.party-line') as HTMLElement | null
    if (partyLine) {
      const tile = partyLine.closest('.tile') as HTMLElement | null
      const grid = tile?.parentElement
      const index = tile && grid ? Array.from(grid.children).indexOf(tile) : -1
      const item = listings[index]
      open(profileSection === 'purchases' ? item?.ownerId : item?.buyerId)
      return
    }
    const chatParty = target.closest('.chat-party') as HTMLElement | null
    if (chatParty) {
      const card = chatParty.closest('.chat-card') as HTMLElement | null
      const list = chatParty.closest('.chat-list') as HTMLElement | null
      const index = card && list ? Array.from(list.querySelectorAll('.chat-card')).indexOf(card) : -1
      const threads = chatThreads.filter(th => th.type === chatTab)
      open(threads[index]?.userId)
      return
    }
    const supportThreadTitle = target.closest('.support-thread-list .chat-card b') as HTMLElement | null
    if (supportThreadTitle) {
      const card = supportThreadTitle.closest('.chat-card') as HTMLElement | null
      const list = supportThreadTitle.closest('.chat-list') as HTMLElement | null
      const index = card && list ? Array.from(list.querySelectorAll('.chat-card')).indexOf(card) : -1
      const threads = chatThreads.filter(th => th.type === 'support')
      open(threads[index]?.userId)
      return
    }
    const sellerReviewAuthor = target.closest('.seller-profile-view .reviews-list > .review-card > .review-author') as HTMLElement | null
    if (sellerReviewAuthor) {
      const card = sellerReviewAuthor.closest('.review-card') as HTMLElement | null
      const list = sellerReviewAuthor.closest('.reviews-list') as HTMLElement | null
      const index = card && list ? Array.from(list.children).indexOf(card) : -1
      open(sellerReviews[index]?.buyer_id)
      return
    }
    const sellerReplyAuthor = target.closest('.seller-profile-view .review-reply small') as HTMLElement | null
    if (sellerReplyAuthor) {
      const card = sellerReplyAuthor.closest('.review-card') as HTMLElement | null
      const list = sellerReplyAuthor.closest('.reviews-list') as HTMLElement | null
      const reply = sellerReplyAuthor.closest('.review-reply') as HTMLElement | null
      const replies = sellerReplyAuthor.closest('.review-replies') as HTMLElement | null
      const reviewIndex = card && list ? Array.from(list.children).indexOf(card) : -1
      const replyIndex = reply && replies ? Array.from(replies.children).indexOf(reply) : -1
      open(sellerReviews[reviewIndex]?.replies?.[replyIndex]?.userId)
    }
  }
  const currencyMark = (currency?: string) => String(currency || 'UAH').toUpperCase()
  const selectedCurrency = String(profile?.preferredCurrency || 'UAH').toUpperCase()
  const convertPrice = (price:number, from:string, to:string) => { const fromRate = currencyRates[String(from||'UAH').toUpperCase()] || 1; const toRate = currencyRates[String(to||'UAH').toUpperCase()] || 1; const uah = Number(price||0) * fromRate; return uah / toRate }
  const priceText = (item: Partial<IListing> & { price?: number | string; currency?: string }) => `${convertPrice(Number(item.price || 0), item.currency || 'UAH', selectedCurrency).toFixed(2)} ${currencyMark(selectedCurrency)}`
  const sortLabel = (value: string) => ({
    newest: 'спочатку нові',
    oldest: 'спочатку старі',
    price_asc: 'ціна зростає',
    price_desc: 'ціна спадає',
    popular_desc: 'популярні спочатку',
    popular_asc: 'менш популярні'
  }[value] || value)
  const totalByCurrencyText = (items: IListing[]) => { const totals = items.reduce((acc, item) => { const key = item.currency || 'UAH'; acc[key] = (acc[key] || 0) + Number(item.price || 0); return acc }, {} as Record<string, number>); return Object.entries(totals).map(([currency, total]) => `${total} ${currencyMark(currency)}`).join(' + ') || `0 ${currencyMark('UAH')}` }
  const focusElement = (selector: string) => setTimeout(() => document.querySelector(selector)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60)
  const requireAuth = (message = 'Увійдіть, щоб виконати цю дію') => { if (store.isAuth) return true; setError(message); setShowAuth(true); focusElement('.login'); return false }
  const syncRouteFromLocation = async () => {
    const path = window.location.pathname
    const params = new URLSearchParams(window.location.search)
    if (path.startsWith('/listing/')) {
      const id = path.split('/')[2]
      if (id) { await openListing(id, undefined, false); return }
    }
    if (path.startsWith('/users/') && path.endsWith('/profile')) {
      const id = path.split('/')[2]
      if (id) { await openSellerProfile(id, false); return }
    }
    if (path.startsWith('/myaccount/profile')) {
      const section = path.split('/')[3] as ProfileSection | undefined
      if (section) await openProfileSection(section, false)
      else await openProfile(false)
      return
    }
    if (path.startsWith('/checkout')) {
      closeTransientPanels()
      setView('checkout')
      try { setCheckoutItems(JSON.parse(sessionStorage.getItem('checkoutItems') || '[]')) } catch {}
      return
    }
    if (path.startsWith('/myaccount/answers')) {
      if (store.isAuth) {
        if (params.has('my_ads')) {
          setChatTab(params.get('my_ads') === '1' ? 'buy' : 'sell')
          await openUserChat(false)
        } else {
          await openSupportChat(false)
        }
      }
      return
    }
    await loadListings(params.get('query') || '', appliedFilters, false)
  }
  const goBack = async () => {
    closeTransientPanels()
    if (window.history.length > 1) {
      window.history.back()
      return
    }
    setView('home'); window.history.replaceState({}, '', '/'); await loadListings(search, appliedFilters, false); window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  useEffect(() => {
    const handlePopState = () => {
      syncRouteFromLocation().catch(()=>null)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  })
  const captureProblemArea = async () => {
    const hidden = Array.from(document.querySelectorAll('.chat-modal,.problem-overlay')) as HTMLElement[]
    hidden.forEach(el => { el.dataset.prevVisibility = el.style.visibility; el.style.visibility = 'hidden' })
    await new Promise(resolve => setTimeout(resolve, 80))
    const width = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth, window.innerWidth)
    const height = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, window.innerHeight)
    const canvas = await html2canvas(document.body, { useCORS: true, scale: 1, x: 0, y: 0, width, height, windowWidth: width, windowHeight: height, scrollX: 0, scrollY: 0 })
    hidden.forEach(el => { el.style.visibility = el.dataset.prevVisibility || ''; delete el.dataset.prevVisibility })
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    return blob ? new File([blob], `problem-page-${Date.now()}.png`, { type: 'image/png' }) : null
  }
  const refreshChatSummary = async () => { if (!store.isAuth) return; try { const r = await ListingService.fetchChatSummary(); setChatSummary(r.data) } catch {} }
  const markCurrentRoomRead = async (roomId = chatRoomRef.current) => {
    if (!roomId || !store.isAuth || readMarkingRoomsRef.current[roomId]) return
    readMarkingRoomsRef.current[roomId] = true
    try {
      const r = await ListingService.markChatRead(roomId)
      if (r.data.ok !== false) {
        const readAt = new Date().toISOString()
        setChatMessages(prev => prev.map(m => m.roomId === roomId && !m.mine && !m.readAt ? { ...m, readAt } : m))
        setChatThreads(prev => prev.map(t => t.roomId === roomId ? { ...t, unreadCount: 0 } : t))
        setChatNotifications(prev => ({ ...prev, [roomId]: false }))
        await refreshChatSummary()
      }
    } catch {} finally {
      readMarkingRoomsRef.current[roomId] = false
    }
  }
  const canSendWithLimit = (logRef: React.MutableRefObject<{ time: number; chars: number }[]>, chars: number, limit: number, label: string) => {
    const now = Date.now()
    logRef.current = logRef.current.filter(x => now - x.time < 5 * 60 * 1000)
    const used = logRef.current.reduce((sum, x) => sum + x.chars, 0)
    if (used + chars > limit) {
      setError(`${label}: забагато тексту за 5 хвилин. Зачекайте трохи.`)
      return false
    }
    logRef.current.push({ time: now, chars })
    return true
  }
  const loadChatRoomMessages = async (roomId: string) => {
    if (!roomId || !store.isAuth) return
    const r = await ListingService.fetchChatMessages(roomId)
    const mapped = r.data.map(m => ({ id: m.id, roomId: m.roomId, text: m.text, nickname: m.nickname, senderUserId: m.senderUserId, senderIsAdmin: m.senderIsAdmin, senderIsActivated: m.senderIsActivated, attachmentUrl: m.attachmentUrl, attachmentName: m.attachmentName, selectionJson: m.selectionJson, createdAt: m.createdAt, editedAt: m.editedAt, deletedAt: m.deletedAt, readAt: m.readAt, mine: String(m.senderUserId || '') === String(store.user.id) }))
    const unread = mapped.find(m => !m.mine && !m.readAt && !m.deletedAt)
    shouldAutoScrollChatRef.current = isChatNearBottom()
    setChatMessages(mapped)
    setChatNotifications(prev => ({ ...prev, [roomId]: false }))
    setChatThreads(prev => prev.map(t => t.roomId === roomId ? { ...t, unreadCount: 0 } : t))
    if (unread?.id) {
      setHighlightMessageId(unread.id)
      setTimeout(()=>document.querySelector(`[data-message-id="${unread.id}"]`)?.scrollIntoView({behavior:'smooth', block:'center'}), 120)
      setTimeout(()=>setHighlightMessageId(''), 3200)
    }
    if (unread) await markCurrentRoomRead(roomId)
    else await refreshChatSummary()
  }
  const openSupportChat = async (pushRoute = true) => {
    if (!store.isAuth) return setShowAuth(true)
    closeTransientPanels(); setView('home')
    setSupportMode(true); setSupportSection('chat'); setShowChat(true)
    let roomId = ''
    if (!(store.user as any).isAdmin) {
      const r = await ListingService.startSupportChat()
      roomId = r.data.roomId
    }
    const threads = (await ListingService.fetchSupportThreads()).data as any
    const supportThreads = Array.from(new Map(threads.map((x:any)=>[x.userId || x.title || x.roomId, { ...x, type:'support', canWrite:true }])).values()) as any[]
    setChatThreads(supportThreads)
    const targetThread = supportThreads.find((x:any)=>Number(x.unreadCount || 0) > 0) || supportThreads[0]
    const targetRoom = roomId || targetThread?.roomId || ''
    setChatRoom(targetRoom)
    if (targetRoom) await loadChatRoomMessages(targetRoom)
    ListingService.fetchComplaints().then(x=>setComplaints(x.data)).catch(()=>null)
    if ((store.user as any).isAdmin) ListingService.fetchModerationListings().then(r=>setModerationListings(r.data)).catch(()=>null)
    if (pushRoute && window.location.pathname !== '/myaccount/answers') window.history.pushState({}, '', '/myaccount/answers')
    focusElement('.chat-window')
  }
  const openUserChat = async (pushRoute = true) => {
    if (!store.isAuth) return setShowAuth(true)
    closeTransientPanels(); setView('home')
    setSupportMode(false)
    setShowChat(true)
    const [sell, buy] = await Promise.all([ListingService.fetchChatThreads('sell'), ListingService.fetchChatThreads('buy')])
    const arr = [...sell.data, ...buy.data].map((x:any)=>({ ...x, canWrite:true }))
    setChatThreads(arr)
    const target = arr.find((x:any)=>Number(x.unreadCount || 0) > 0) || arr[0]
    if (target) {
      setChatTab(target.type)
      setChatRoom(target.roomId)
      setChatNotifications(prev=>({...prev,[target.roomId]:false}))
      if (pushRoute) window.history.pushState({}, '', `/myaccount/answers/?my_ads=${target.type==='buy'?1:0}`)
      await loadChatRoomMessages(target.roomId)
    }
    await refreshChatSummary()
    focusElement('.chat-window')
  }
  const sendChatMessage = async (selectionJson = '', forcedAttachment: File | null = null) => {
    const files = forcedAttachment ? [forcedAttachment] : chatAttachments.slice(0, 10)
    if ((!chatInput.trim() && files.length === 0 && !selectionJson) || !chatRoom) return
    if (chatInput.length > 400) { setError('Повідомлення не може бути довшим за 400 символів'); return }
    if (!canSendWithLimit(chatSendLogRef, chatInput.length, 10000, 'Чат')) return
    const nickname = profile?.nickname || (store.user.email || 'Користувач').split('@')[0]
    const uploads = files.length ? await Promise.all(files.map(async (file) => (await ListingService.uploadChatAttachment(file)).data)) : [{ url: '', name: '' }]
    const outgoing = uploads.map((uploaded, idx) => ({
      type: 'message',
      roomId: chatRoom,
      text: idx === 0 ? (chatInput || (selectionJson ? 'Область проблеми прикріплена' : '')) : '',
      nickname,
      senderId: clientId,
      senderUserId: store.user.id,
      senderIsAdmin: !!(store.user as any).isAdmin,
      senderIsActivated: !!(store.user as any).isActivated,
      attachmentUrl: uploaded.url,
      attachmentName: uploaded.name,
      selectionJson: idx === 0 ? selectionJson : ''
    }))
    outgoing.forEach(payload => socket?.send(JSON.stringify(payload)))
    setChatMessages(prev => [...prev, ...outgoing.map(payload => ({ roomId: chatRoom, text: payload.text, mine: true, nickname, senderUserId: store.user.id, senderIsAdmin: !!(store.user as any).isAdmin, senderIsActivated: !!(store.user as any).isActivated, attachmentUrl: payload.attachmentUrl, attachmentName: payload.attachmentName, selectionJson: payload.selectionJson }))])
    setChatInput('')
    setChatAttachments([])
    setChatThreads(prev => prev.map(t => t.roomId === chatRoom ? { ...t, canWrite: true, messageCount: Math.max(1, Number(t.messageCount || 0) + outgoing.length) } : t))
    setTimeout(()=>refreshCurrentChat(), 180)
    setTimeout(()=>refreshCurrentChat(), 800)
    await refreshChatSummary()
    if (supportMode) ListingService.fetchSupportThreads().then(r => setChatThreads(Array.from(new Map((r.data as any).map((x:any)=>[x.userId || x.title || x.roomId, { ...x, type:'support', canWrite:true }])).values()) as any[])).catch(()=>null)
  }
  const refreshCurrentChat = async () => {
    if (!chatRoom || !store.isAuth) return
    await loadChatRoomMessages(chatRoom)
  }
  const editChatMessage = async (id?: string) => {
    if (!id || !editingMessageText.trim()) return
    await ListingService.editChatMessage(id, editingMessageText)
    setEditingMessageId('')
    setEditingMessageText('')
    await refreshCurrentChat()
  }
  const deleteChatMessage = async (id?: string) => {
    if (!id) return
    await ListingService.deleteChatMessage(id)
    await refreshCurrentChat()
  }
  const hideCurrentChat = async () => {
    if (!chatRoom) return
    try { await ListingService.hideChatThread(chatRoom) } catch { setError('Системні чати підтримки не можна видаляти'); return }
    setChatMessages([])
    setChatThreads(prev => prev.filter(t => t.roomId !== chatRoom))
    setChatNotifications(prev => ({ ...prev, [chatRoom]: false }))
    setChatRoom('')
    await refreshChatSummary()
  }
  const closeChatWindow = async () => {
    const current = chatThreads.find(t => t.roomId === chatRoom)
    if (!supportMode && current && !Number(current.messageCount || 0) && !chatMessages.some(m => m.roomId === chatRoom && !m.deletedAt)) {
      try { await ListingService.hideChatThread(chatRoom) } catch {}
      setChatThreads(prev => prev.filter(t => t.roomId !== chatRoom))
      setChatMessages([])
      setChatRoom('')
    }
    setChatAttachments([])
    setShowChat(false)
    pinnedChatRef.current = null
  }
  const openAdminUser = async (id: string) => {
    const details = (await UserService.fetchAdminUserDetails(id)).data
    setSelectedAdminUser(details)
    setAdminChatRoom(details.chats[0]?.roomId || '')
  }
  const refreshAdminUser = async () => {
    if (!selectedAdminUser) return
    const details = (await UserService.fetchAdminUserDetails(selectedAdminUser.user.id)).data
    setSelectedAdminUser(details)
    setAdminUsers((await UserService.fetchUsers()).data as IUserProfile[])
  }
  const voteReview = async (reviewId: string, voteType: 'like'|'dislike') => {
    if (!requireAuth('Увійдіть, щоб оцінити відгук')) return
    const r = (await ListingService.voteReview(reviewId, voteType)).data
    setSellerReviews(prev => prev.map(item => item.id === r.reviewId ? { ...item, likes: r.likes, dislikes: r.dislikes, my_vote: r.myVote } : item))
  }
  const openAdminListingAction = (listing: IListing, action: 'delete'|'deactivate'|'activate') => {
    setAdminDeleteTarget({ listing, action }); setAdminDeleteTitle(action === 'activate' ? listing.title : ''); setAdminDeleteReason('')
  }
  const confirmAdminListingAction = async () => {
    if (!adminDeleteTarget) return
    if (adminDeleteTarget.action !== 'activate' && adminDeleteTitle !== adminDeleteTarget.listing.title) { setError(`Впишіть точну назву оголошення: ${adminDeleteTarget.listing.title}`); focusElement('.confirm-box input'); return }
    if (adminDeleteTarget.action !== 'activate' && !adminDeleteReason.trim()) { setError('Вкажіть причину для користувача'); focusElement('.confirm-box textarea'); return }
    const action = adminDeleteTarget.action
    const listingId = adminDeleteTarget.listing._id
    let changedListing: IListing | null = null
    if (action === 'delete') await ListingService.adminDeleteListing(listingId, adminDeleteTitle, adminDeleteReason)
    if (action === 'deactivate') changedListing = (await ListingService.adminDeactivateListing(listingId, adminDeleteTitle, adminDeleteReason)).data
    if (action === 'activate') changedListing = (await ListingService.adminActivateListing(listingId, adminDeleteTarget.listing.title, adminDeleteReason)).data
    setAdminDeleteTarget(null)
    if (changedListing) {
      const updatedListing = changedListing
      setCurrentListing(prev => prev?._id === updatedListing._id ? updatedListing : prev)
      setListings(prev => {
        const next = prev.some(item => item._id === updatedListing._id)
          ? prev.map(item => item._id === updatedListing._id ? updatedListing : item)
          : prev
        return view === 'home' && updatedListing.status !== 'active' ? next.filter(item => item._id !== updatedListing._id) : next
      })
    }
    if (selectedAdminUser) await refreshAdminUser()
    if ((store.user as any).isAdmin) ListingService.fetchModerationListings().then(r=>setModerationListings(r.data)).catch(()=>null)
    if (action === 'delete') {
      setListings(prev => prev.filter(item => item._id !== listingId))
      if (currentListing?._id === listingId || view === 'home') await loadListings(search)
    }
  }
  const sendReviewReply = async (reviewId: string) => {
    if (!requireAuth('Увійдіть, щоб відповісти на відгук')) return
    const text = (replyDrafts[reviewId] || '').trim()
    const sellerId = currentListing?.ownerId || publicProfile?.user.id
    if (!text) { setError('Напишіть відповідь'); focusElement('.reply-box input'); return }
    if (!sellerId) return
    await ListingService.addReviewReply(reviewId, text)
    setReplyDrafts(prev => ({ ...prev, [reviewId]: '' }))
    setSellerReviews((await ListingService.fetchSellerReviews(sellerId)).data)
  }
  const purchaseReviewKey = (item: IListing) => item.purchaseId || `${item._id}-${item.purchasedAt || ''}`
  const submitPurchaseReview = async (item: IListing) => {
    if (!item.ownerId) return
    const reviewKey = purchaseReviewKey(item)
    const draft = purchaseReviewDrafts[reviewKey] || { rating: 5, comment: '', pros: '', cons: '' }
    if (!draft.comment.trim()) { setError('Напишіть короткий відгук про покупку'); focusElement('.pending-review-card input'); return }
    await ListingService.addReview({ sellerId: item.ownerId, listingId: item._id, purchaseId: item.purchaseId, rating: draft.rating || 5, comment: draft.comment, pros: draft.pros, cons: draft.cons })
    setPurchaseReviewDrafts(prev => { const next = { ...prev }; delete next[reviewKey]; return next })
    const pending = (await ListingService.fetchPendingReviews()).data
    setListings(pending)
    setPendingReviewCount(pending.length)
    setError('')
  }
  const renderMyReviewCard = (r: SellerReview, mode: 'received'|'given') => {
    const author = mode === 'received'
      ? userNameLink(r.buyer_id, r.buyer_nickname || r.buyer_email || 'Користувач', r.buyer_is_admin, r.buyer_is_activated)
      : userNameLink(r.seller_id, r.seller_nickname || r.seller_email || 'Продавець', r.seller_is_admin, r.seller_is_activated)
    return <div className='review-card rozetka-review' key={`${mode}-${r.id}`}><div className='review-author'>{author}<span>{r.created_at ? new Date(r.created_at).toLocaleDateString() : ''}</span></div>{(r.listing_title || r.listing_image_url) && <button className='review-product-card' onClick={()=>r.listing_id ? openListing(r.listing_id, { title: r.listing_title, imageUrl: r.listing_image_url, price: r.listing_price, created_at: r.created_at }) : undefined}>{r.listing_image_url && <img src={r.listing_image_url} alt={r.listing_title || 'Оголошення'}/>}<span><b>{r.listing_title || 'Оголошення видалено'}</b>{r.listing_price !== null && r.listing_price !== undefined ? <em>{r.listing_price} грн</em> : null}</span></button>}<div className='review-stars'>{Array.from({length:r.rating || 0}).map((_,i)=><img key={i} src='/media/icons/star-gold.svg' alt='Зірка'/>)}</div><p>{r.comment || 'Без коментаря'}</p><p><b>Переваги:</b> {r.pros || '-'}</p><p><b>Недоліки:</b> {r.cons || '-'}</p></div>
  }
  const finishProblemSelection = async () => {
    const areaFile = await captureProblemArea()
    setProblemSelectorOpen(false)
    if (problemTarget === 'complaint') {
      if (areaFile) setComplaintImages(prev => [...prev, areaFile].slice(0, 10))
      setShowComplaint(true)
      return
    }
    setShowChat(true)
    if (areaFile) setChatAttachments(prev => [...prev, areaFile].slice(0, 10))
  }
  const attachFullPageProblem = async (target: 'support'|'complaint') => {
    setProblemTarget(target)
    setProblemSelectorOpen(false)
    setShowChat(false)
    setShowComplaint(false)
    await new Promise(resolve => setTimeout(resolve, 120))
    const areaFile = await captureProblemArea()
    if (target === 'complaint') {
      if (areaFile) setComplaintImages(prev => [...prev, areaFile].slice(0, 10))
      setShowComplaint(true)
      return
    }
    setShowChat(true)
    if (areaFile) setChatAttachments(prev => [...prev, areaFile].slice(0, 10))
  }
  const hasUnsavedFormChanges = () => Object.entries(form).some(([key, value]) => value.trim() !== String((defaultForm as any)[key] || '').trim()) || imageSlots.some(Boolean) || existingEditImages.some(Boolean)
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!showForm || !hasUnsavedFormChanges()) return
      event.preventDefault()
      event.returnValue = 'Незбережені зміни буде втрачено'
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [showForm, form, imageSlots])
  const cancelForm = () => {
    if (hasUnsavedFormChanges() && !window.confirm('Ви впевнені, що хочете закрити форму? Усі незбережені зміни буде втрачено.')) return false
    setShowForm(false); setEditing(null); setImageSlots([null, null, null, null, null, null]); setForm(defaultForm); return true
  }
  const onHomeClick = async () => { if (showForm && !cancelForm()) return; closeTransientPanels(); setView('home'); window.history.pushState({}, '', '/'); await loadListings(''); window.scrollTo({top:0,behavior:'smooth'}) }
  const setSlotFile = (index: number, file: File | null) => setImageSlots(prev => prev.map((f, i) => i === index ? file : f))
  const removeSlotImage = (index: number) => { setImageSlots(prev => prev.map((f, i) => i === index ? null : f)); setExistingEditImages(prev => prev.map((u, i) => i === index ? '' : u)) }
  const onDropToSlot = (index: number, event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    setDragOverIndex(null)
    if (draggingFrom !== null && draggingFrom !== index) {
      setImageSlots(prev => {
        const next = [...prev]
        const moved = next[draggingFrom]
        next[draggingFrom] = next[index]
        next[index] = moved
        return next
      })
      setExistingEditImages(prev => {
        const next = [...prev]
        const moved = next[draggingFrom] || ''
        next[draggingFrom] = next[index] || ''
        next[index] = moved
        return next
      })
      setDraggingFrom(null)
      return
    }
    const files = Array.from(event.dataTransfer.files || []).filter((f)=>f.type.startsWith('image/'))
    if (files.length > 1) { insertFilesIntoSlots(files); setDraggingFrom(null); return }
    const file = files[0]
    if (file && existingEditImages[index]) { insertFilesIntoSlots([file]); setDraggingFrom(null); return }
    if (file) { setSlotFile(index, file) }
    setDraggingFrom(null)
  }
  const addImageSlot = () => setImageSlots(prev => [...prev, null])
  const insertFilesIntoSlots = (files: File[]) => setImageSlots(prev => {
    const next = [...prev]
    let idx = 0
    for (let i = 0; i < next.length && idx < files.length; i++) if (!next[i] && !existingEditImages[i]) next[i] = files[idx++]
    while (idx < files.length) next.push(files[idx++])
    return next
  })
  const examples = getListingCategoryExamples(form.category)

  const saveListing = async () => {
    const images = imageSlots.filter(Boolean) as File[]
    const nextErrors = validateListingForm(form)
    setFormErrors(nextErrors)
    if (hasListingFormErrors(nextErrors)) { setError('Заповніть коректно обовʼязкові поля'); focusElement('.field-error'); return }
    if (!editing && !images.length) { setError('Додайте хоча б одне фото'); focusElement('.upload-grid'); return }
    if (editing) await ListingService.updateListing(editing._id, { ...form, images, existingImageUrls: existingEditImages.filter(Boolean), imageUrl: (existingEditImages.find(Boolean) || editing.imageUrl) })
    else await ListingService.createListing({ ...form, images })
    setShowForm(false); setImageSlots([null, null, null, null, null, null]); setExistingEditImages([]); setForm(defaultForm); setEditing(null); await openProfileSection('my')
  }

  const closeBannedSession = useCallback((user: any) => {
    const until = user?.bannedUntil ? ` до ${new Date(user.bannedUntil).toLocaleString()}` : ''
    const reason = user?.banReason ? ` Причина: ${user.banReason}` : ''
    localStorage.removeItem('token')
    store.setAuth(false)
    store.setUser({} as any)
    setSocket(prev => {
      try {
        if (prev && prev.readyState === WebSocket.OPEN) prev.close()
      } catch {}
      return null
    })
    setProfile(null)
    setSelectedAdminUser(null)
    setShowAuth(false)
    setShowChat(false)
    setShowForm(false)
    setShowComplaint(false)
    setCurrentListing(null)
    setCheckoutItems([])
    setView('home')
    window.history.pushState({}, '', '/')
    setError(`Ваш акаунт заблоковано адміністратором${user?.bannedPermanent ? ' назавжди' : until}.${reason}`)
  }, [store])


  useEffect(() => {
    if (!store.isAuth) return
    const url = process.env.REACT_APP_WS_URL || (window.location.origin.replace('http://', 'ws://').replace('https://', 'wss://').replace(':3000', ':5000') + '/ws')
    const ws = new WebSocket(url)
    ws.onopen = () => { if (chatRoomRef.current) ws.send(JSON.stringify({ type: 'join', roomId: chatRoomRef.current })) }
    ws.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data)
        if (data.type === 'user-ban' && String(data.userId || data.user?.id || '') === String(store.user.id || '')) {
          closeBannedSession(data.user || {})
          return
        }
        if (data.type === 'message') {
          if (data.senderId === clientId || String(data.senderUserId || '') === String(store.user.id || '')) return
          if (data.roomId === chatRoomRef.current && isChatNearBottom()) shouldAutoScrollChatRef.current = true
          setChatMessages(prev => [...prev, { id: data.id || '', roomId: data.roomId, text: data.text, mine: false, nickname: data.nickname, senderUserId: data.senderUserId || null, senderIsAdmin: !!data.senderIsAdmin, senderIsActivated: !!data.senderIsActivated, attachmentUrl: data.attachmentUrl || '', attachmentName: data.attachmentName || '', selectionJson: data.selectionJson || '', createdAt: data.createdAt || new Date().toISOString(), readAt: null }])
          if (data.roomId !== chatRoomRef.current) setChatNotifications(prev => ({ ...prev, [data.roomId]: true })); setChatThreads(prev => prev.map(th => th.roomId===data.roomId ? { ...th, canWrite: true } : th))
          refreshChatSummary()
          if (String(data.roomId || '').includes('support')) ListingService.fetchSupportThreads().then(r => setChatThreads(Array.from(new Map((r.data as any).map((x:any)=>[x.userId || x.title || x.roomId, { ...x, type:'support', canWrite:true }])).values()) as any[])).catch(()=>null)
        }
        if (data.type === 'message-edited') {
          setChatMessages(prev => prev.map(m => m.id === data.messageId ? { ...m, text: data.text || m.text, editedAt: data.editedAt || new Date().toISOString() } : m))
        }
        if (data.type === 'message-deleted') {
          setChatMessages(prev => prev.map(m => m.id === data.messageId ? { ...m, text: 'Повідомлення видалено', deletedAt: data.deletedAt || new Date().toISOString(), attachmentUrl: '', selectionJson: '' } : m))
        }
        if (data.type === 'chat-summary-changed') {
          refreshChatSummary()
        }
        if (data.type === 'chat-read' && data.roomId) {
          if (String(data.readerUserId || '') !== String(store.user.id || '')) setChatMessages(prev => prev.map(m => (m.roomId === data.roomId && m.mine && !m.readAt) ? { ...m, readAt: data.readAt || new Date().toISOString() } : m))
          setChatThreads(prev => prev.map(th => th.roomId === data.roomId ? { ...th, unreadCount: 0 } : th))
        }
        if (data.type === 'listing-upsert' && data.listing) {
          const item = data.listing as IListing
          if (item.status === 'active') setListings(prev => {
            const merged = prev.some(x => x._id === item._id)
              ? prev.map(x => x._id === item._id ? item : x)
              : (viewRef.current === 'home' ? [item, ...prev] : prev)
            return viewRef.current === 'home'
              ? applyListingFilters(merged, appliedFiltersRef.current, selectedCurrencyRef.current, currencyRatesRef.current, searchRef.current)
              : merged
          })
          else setListings(prev => prev.map(x => x._id === item._id ? item : x).filter(x => viewRef.current !== 'home' || x.status === 'active'))
          if (currentListing?._id === item._id) setCurrentListing(item)
        }
        if (data.type === 'listing-remove') {
          setListings(prev => prev.filter(x => x._id !== data.listingId))
          if (currentListing?._id === data.listingId) setCurrentListing(prev => prev ? { ...prev, status: data.status === 'sold' ? 'sold' : 'deactivated', moderationReason: data.status === 'sold' ? 'Оголошення вже купили' : 'Оголошення недоступне' } : prev)
        }
      } catch {}
    }
    ws.onerror = () => null
    setSocket(ws)
    return () => { if (ws.readyState === WebSocket.OPEN) ws.close() }
  }, [store.isAuth])

  useEffect(() => { if (chatRoom && socket?.readyState === 1) socket.send(JSON.stringify({ type: 'join', roomId: chatRoom })) }, [chatRoom, socket])
  useEffect(() => {
    if (!chatRoom || !store.isAuth) return
    loadChatRoomMessages(chatRoom).catch(()=>null)
  }, [chatRoom, store.isAuth, store.user.email, profile?.nickname])

  useEffect(() => {
    if (!showChat || !store.isAuth) return
    if (supportMode) {
      ListingService.fetchSupportThreads().then(r => { const arr=Array.from(new Map((r.data as any).map((x:any)=>[x.userId || x.title || x.roomId, { ...x, type:'support', canWrite:true }])).values()) as any[]; setChatThreads(arr); if(!chatRoom && arr[0]) setChatRoom(arr[0].roomId) })
      ListingService.fetchComplaints().then(r=>setComplaints(r.data)).catch(()=>null)
      return
    }
    ListingService.fetchChatThreads(chatTab).then(r => { const uniq = Array.from(new Map(r.data.map((x:any)=>[x.roomId, x])).values()); const fetched=uniq.map((x:any)=>({ ...x, canWrite: true })); let nextRooms = fetched; setChatThreads(prev => { const pinned = pinnedChatRef.current?.type === chatTab ? prev.find(t => t.roomId === pinnedChatRef.current?.roomId) : null; const opened = prev.find(t => t.roomId === chatRoom && t.type === chatTab); const keep = pinned || opened; nextRooms = keep && !fetched.some((t:any)=>t.roomId===keep.roomId) ? [keep, ...fetched] : fetched; return nextRooms }); setChatRoom(prev => nextRooms.some((t:any)=>t.roomId===prev) ? prev : (pinnedChatRef.current?.type === chatTab ? pinnedChatRef.current.roomId : (nextRooms[0]?.roomId || ''))) })
  }, [showChat, chatTab, store.isAuth, supportMode, chatRoom])

  useEffect(() => {
    if (!showChat || !supportMode || !store.isAuth) return
    const timer = window.setInterval(() => {
      ListingService.fetchSupportThreads().then(r => setChatThreads(Array.from(new Map((r.data as any).map((x:any)=>[x.userId || x.title || x.roomId, { ...x, type:'support', canWrite:true }])).values()) as any[])).catch(()=>null)
      ListingService.fetchComplaints().then(r=>setComplaints(r.data)).catch(()=>null)
      refreshChatSummary()
    }, 4000)
    return () => window.clearInterval(timer)
  }, [showChat, supportMode, store.isAuth])
  useEffect(() => {
    if (!showChat || supportMode || !chatRoom || !store.isAuth) return
    const timer = window.setInterval(() => refreshCurrentChat(), 4000)
    return () => window.clearInterval(timer)
  }, [showChat, supportMode, chatRoom, store.isAuth])

  useEffect(() => {
    if (shouldAutoScrollChatRef.current) {
      shouldAutoScrollChatRef.current = false
      setTimeout(()=>scrollChatToBottom('smooth'), 40)
    }
  }, [chatMessages.length, chatRoom])

  useEffect(() => {
    if (!showChat || !chatRoom || !store.isAuth) return
    const root = chatMessagesContainerRef.current
    const unread = chatMessages.some(m => m.roomId === chatRoom && !m.mine && !m.readAt && !m.deletedAt)
    if (!root || !unread) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= 0.6)) markCurrentRoomRead(chatRoom)
    }, { root, threshold: [0.6] })
    root.querySelectorAll('[data-unread-incoming="true"]').forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [showChat, chatRoom, store.isAuth, chatMessages])

  useEffect(() => { refreshChatSummary() }, [store.isAuth])

  if (showAuth) { if(!window.location.pathname.startsWith('/auth/')) window.history.pushState({}, '', '/auth/login'); return <LoginForm onClose={() => { setShowAuth(false); loadListings(search) }} onSuccess={() => { setShowAuth(false); loadListings(search) }} /> }

  const detailImages = currentListing ? ((currentListing.imageUrls && currentListing.imageUrls.length) ? currentListing.imageUrls : [currentListing.imageUrl]) : []
  const editImages = editing ? existingEditImages : []
  const showPageLoader = store.isLoading || appBusy
  const defaultAvatar = '/media/icons/user_profile.png'
  const safeImg = (e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.src = defaultAvatar }
  const isChatNearBottom = () => {
    const root = chatMessagesContainerRef.current
    if (!root) return true
    return isNearBottom(root.scrollHeight, root.scrollTop, root.clientHeight)
  }
  const scrollChatToBottom = (behavior: ScrollBehavior = 'smooth') => {
    const root = chatMessagesContainerRef.current
    if (root) root.scrollTo({ top: root.scrollHeight, behavior })
  }

  const categoryColor = (category?: string | null) => {
    const palette = ['#1769d1', '#0f9f6e', '#d97706', '#b91c1c', '#7c3aed', '#0f766e', '#be123c']
    const key = String(category || 'Інше')
    return palette[key.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % palette.length]
  }
  const renderProfileStats = (data: PublicUserProfile) => {
    const makeTimeline = (items: any[], dateKey: 'soldAt'|'purchasedAt', title: string) => {
      const timeline = [...items].sort((a,b)=>new Date(a[dateKey]).getTime()-new Date(b[dateKey]).getTime())
      if (!timeline.length) return <section className='timeline-card'><div className='chart-headline'><h3>{title}</h3><span>0 угод</span></div><div className='empty-chart-note'>Даних для графіка поки немає.</div></section>
      const prices = timeline.map(x=>Number(x.price || 0))
      const minPrice = Math.min(...prices, 0)
      const maxPrice = Math.max(...prices, 1)
      const point = (x:any, idx:number) => ({
        x: 54 + (timeline.length === 1 ? 0.5 : idx / Math.max(1, timeline.length - 1)) * 242,
        y: 176 - ((Number(x.price || 0) - minPrice) / Math.max(1, maxPrice - minPrice)) * 126
      })
      const points = timeline.map((item, idx) => point(item, idx))
      const path = points.map((p,idx)=>`${idx ? 'L' : 'M'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
      const recent = timeline.slice(-4).reverse()
      return <section className='timeline-card'><div className='chart-headline'><h3>{title}</h3><span>{timeline.length} {timeline.length === 1 ? 'угода' : 'угод'}</span></div><svg viewBox='0 0 330 230' className='timeline-chart'><line x1='44' y1='22' x2='44' y2='178'/><line x1='44' y1='178' x2='304' y2='178'/>{[0,1,2].map(n=><line key={n} x1='44' y1={52+n*42} x2='304' y2={52+n*42} className='chart-grid'/>)}{timeline.length > 1 && <path d={path} className='timeline-path'/>}{timeline.map((item,idx)=>{const p=points[idx]; const dateText=new Date(item[dateKey]).toLocaleString(); return <g key={`${item.listingId || title}-${idx}`} className={item.listingId ? 'chart-point' : ''} onClick={()=>item.listingId && openListing(item.listingId, item)}><title>{`${item.title}\n${item.description || ''}\n${item.price} ${currencyMark(item.currency)}\n${dateText}`}</title><circle cx={p.x} cy={p.y} r='7' fill={categoryColor(item.category)}/><circle cx={p.x} cy={p.y} r='12' fill={categoryColor(item.category)} opacity='.14'/></g>})}<text x='48' y='204'>{new Date(timeline[0][dateKey]).toLocaleDateString()}</text><text x='304' y='204' textAnchor='end'>{new Date(timeline[timeline.length-1][dateKey]).toLocaleDateString()}</text><text x='48' y='20'>{maxPrice} {currencyMark(timeline[prices.indexOf(maxPrice)]?.currency)}</text><text x='48' y='192'>{minPrice} {currencyMark(timeline[prices.indexOf(minPrice)]?.currency)}</text></svg><div className='timeline-items'>{recent.map((item,idx)=><button key={`${item.listingId || title}-recent-${idx}`} onClick={()=>item.listingId && openListing(item.listingId, item)} disabled={!item.listingId}><span><i style={{background:categoryColor(item.category)}}/> {item.title || 'Оголошення'}</span><b>{item.price} {currencyMark(item.currency)}</b><small>{new Date(item[dateKey]).toLocaleDateString()}</small></button>)}</div></section>
    }
    const makePie = (stats: Record<string, number> = {}, title: string) => {
      const total = getCategoryTotal(stats)
      const entries = getPositiveCategoryEntries(stats)
      if (!entries.length) return <section><h3>{title}</h3><div className='empty-chart-note'>{getEmptyCategoryMessage(title)}</div></section>
      let offset = 0
      return <section><h3>{title}</h3><svg viewBox='0 0 220 220' className='pie-chart'>{entries.map(([name,count])=>{const value=Number(count||0); const dash=value/total*100; const ring=<circle key={name} cx='110' cy='110' r='72' fill='none' stroke={categoryColor(name)} strokeWidth='34' strokeDasharray={`${dash} ${100-dash}`} strokeDashoffset={-offset} pathLength='100'><title>{`${name}: ${value}`}</title></circle>; offset+=dash; return ring})}<circle cx='110' cy='110' r='48' fill='#fff'/></svg><div className='chart-legend'>{entries.map(([name,count])=><span key={name}><i style={{background:categoryColor(name)}}/> {name}: {Number(count||0)}</span>)}</div></section>
    }
    return <div className='profile-stats'>{makeTimeline(data.salesTimeline || [], 'soldAt', 'Динаміка продажів')}{makeTimeline(data.purchasesTimeline || [], 'purchasedAt', 'Динаміка покупок')}{makePie(data.categoryStats?.listed || {}, 'Категорії оголошень')}{makePie(data.categoryStats?.sold || {}, 'Категорії продажів')}{makePie(data.categoryStats?.bought || {}, 'Категорії покупок')}</div>
  }

  const selectedAdminUserIsOwnAccount = selectedAdminUser ? String(selectedAdminUser.user.id) === String(store.user.id) : false
  const selectedAdminUserIsSuperAdmin = !!selectedAdminUser?.user.isSuperAdmin
  const canModerateSelectedAdminUser = !!selectedAdminUser && !selectedAdminUserIsOwnAccount && !selectedAdminUserIsSuperAdmin
  const canChangeSelectedAdminAccess = !!selectedAdminUser && !!(store.user as any).isSuperAdmin && !selectedAdminUserIsOwnAccount && !selectedAdminUserIsSuperAdmin
  const currentUserNickname = (profile?.nickname || store.user.nickname || store.user.email?.split('@')[0] || store.user.email || 'Користувач')

  return <div className='page' onClickCapture={handleProfileNameClick} onClick={()=>error && setError('')}>{showPageLoader && <div className='app-loader' aria-live='polite'><div className='store-pulse-loader'><span/><span/><span/></div><p>Завантаження...</p></div>}<header className='header-wrap'><div className='top container1200'><h1><button className='link-btn' onClick={onHomeClick}><span className='text-logo'>ecommerce-<b>store</b></span></button></h1><div className='search-row header-search'><input onKeyDown={e=>e.key==='Enter'&&loadListings(search)} value={search} onFocus={()=>setFocused(true)} onBlur={()=>setTimeout(()=>setFocused(false),150)} onChange={e=>setSearch(e.target.value)} placeholder={placeholder}/><button className='icon-btn' onClick={()=>loadListings(search)}><img src='/media/icons/market-research.png' alt='Пошук' style={{width:30,height:30}}/></button><button onClick={()=>{setShowForm(false);setShowChat(false);setShowComplaint(false);setShowFilters(!showFilters)}}>{showFilters ? <img src='/media/icons/undo.png' alt='Закрити фільтр' style={{width:18}}/> : 'Фільтр'}</button>{focused && <div className='suggestions'>{topSearches.map((s)=> <button key={s.query_text} onClick={()=>{setSearch(s.query_text)}}>{s.query_text}</button>)}</div>}</div><div className='header-actions'>{store.isAuth ? <><button className='user-btn clickable-profile' onClick={()=>openProfile()}>{(profile?.avatarUrl || (store.user as any).avatarUrl) && <img className='header-avatar' src={profile?.avatarUrl || (store.user as any).avatarUrl} alt='Аватар' onError={safeImg}/>}<span className='header-user-name'>{currentUserNickname}</span>{roleBadge((store.user as any).isAdmin,(store.user as any).isActivated, false)}</button><button onClick={()=>{setError('');store.logout()}}>Вийти</button></> : <button onClick={()=>setShowAuth(true)}>Реєстрація / Вхід</button>}<button className='icon-btn chat-header-btn' onClick={async()=>{if(showChat){await closeChatWindow();return} await openUserChat(); focusElement('.chat-window')}}><img src='/media/icons/chat.png' alt='Чат' style={{width:34,height:34}}/>{store.isAuth && ((chatSummary?.listingCount || 0) + Object.entries(chatNotifications).filter(([room,v])=>v && !room.includes('support')).length)>0 && <b>{(chatSummary?.listingCount || 0) + Object.entries(chatNotifications).filter(([room,v])=>v && !room.includes('support')).length}</b>}</button><div className='header-badges'>{Object.values(favoriteIds).filter(Boolean).length>0 && <span className='badge-icon' onClick={()=>openProfileSection('favorites')}><img src='/media/icons/bookmark_favorite.png' alt='Обране'/><b>{Object.values(favoriteIds).filter(Boolean).length}</b></span>}{Object.values(cartIds).filter(Boolean).length>0 && <span className='badge-icon' onClick={()=>openProfileSection('cart')}><img src='/media/icons/shopping-cart.png' alt='Кошик'/><b>{Object.values(cartIds).filter(Boolean).length}</b></span>}</div><button className='primary' onClick={() => { closeTransientPanels(); return store.isAuth ? setShowForm(!showForm) : requireAuth('Увійдіть, щоб додати оголошення')}}>{showForm ? <img className='close-action-icon' src='/media/icons/undo.png' alt='Закрити форму' style={{width:18}}/> : 'Додати оголошення'}</button></div></div></header><div className='container1200'>
  <ErrorMessage message={error} />
  {showFilters && <div className='form'><label>Ціна від ({selectedCurrency})</label><input type='number' value={filters.minPrice} onChange={e=>setFilters({...filters,minPrice:e.target.value})}/><label>Ціна до ({selectedCurrency})</label><input type='number' value={filters.maxPrice} onChange={e=>setFilters({...filters,maxPrice:e.target.value})}/><label>Категорія</label><select value={filters.category} onChange={e=>setFilters({...filters,category:e.target.value})}><option value=''>Будь-яка</option>{categories.map(c => <option key={c} value={c}>{c}</option>)}</select><label>Сортування</label><select value={filters.sortBy} onChange={e=>setFilters({...filters,sortBy:e.target.value})}><option value='newest'>Спочатку нові</option><option value='oldest'>Спочатку старі</option><option value='price_asc'>Ціна: зростання</option><option value='price_desc'>Ціна: спадання</option><option value='popular_desc'>Популярні спочатку</option><option value='popular_asc'>Менш популярні</option></select><button className='primary' onClick={()=>{setAppliedFilters(filters);setShowFilters(false);loadListings(search, filters)}}>Застосувати</button></div>}
  {showForm && <div className='form' onClick={(e)=>e.stopPropagation()}><label>Категорія</label><select className={formErrors.category ? 'field-error' : ''} value={form.category} onChange={e=>setForm({...form,category:e.target.value})}><option value=''>Оберіть категорію</option>{categories.map(c => <option key={c} value={c}>{c}</option>)}</select><label>Назва</label><input className={formErrors.title ? 'field-error' : ''} maxLength={120} placeholder={examples.title} value={form.title} onChange={e=>setForm({...form,title:e.target.value.slice(0,120)})}/><label>Опис</label><textarea className={formErrors.description ? 'field-error' : ''} maxLength={3000} placeholder={examples.description} value={form.description} onChange={e=>setForm({...form,description:e.target.value.slice(0,3000)})}/><label>Ціна</label><div className='price-currency-row'><input className={formErrors.price ? 'field-error' : ''} type='number' placeholder='Приклад: 3400' value={form.price} onChange={e=>setForm({...form,price:e.target.value})}/><select value={form.currency} onChange={e=>setForm({...form,currency:e.target.value})}><option value='UAH'>UAH</option><option value='USD'>USD</option><option value='EUR'>EUR</option></select></div><label>Фото</label><ImageUploadGrid
  imageSlots={imageSlots}
  existingImages={editImages}
  dragOverIndex={dragOverIndex}
  draggingFrom={draggingFrom}
  isDraggingImage={isDraggingImage}
  onDragOverSlot={setDragOverIndex}
  onDragLeaveSlot={() => setDragOverIndex(null)}
  onDropToSlot={onDropToSlot}
  onInsertFiles={insertFilesIntoSlots}
  onDragStartImage={(idx) => { setDraggingFrom(idx); setIsDraggingImage(true) }}
  onDragEndImage={() => { setDraggingFrom(null); setDragOverIndex(null); setIsDraggingImage(false) }}
  onRemoveSlotImage={removeSlotImage}
  onRemoveExtraSlot={(idx) => setImageSlots(prev => prev.filter((_, i) => i !== idx))}
  onAddSlot={addImageSlot}
/><label>Локація</label><input className={formErrors.location ? 'field-error' : ''} maxLength={120} placeholder={examples.location} value={form.location} onChange={e=>setForm({...form,location:e.target.value.slice(0,120)})}/><label>Телефон (необов'язково)</label><input inputMode='tel' pattern='[+0-9]*' placeholder='Приклад: +380991112233' maxLength={30} value={form.phone} onChange={e=>setForm({...form,phone:e.target.value.replace(/(?!^)\+/g,'').replace(/[^\d+]/g,'')})}/><div style={{display:'flex', gap:10}}><button className='primary' onClick={saveListing}>Зберегти</button><button onClick={cancelForm}>Скасувати</button></div></div>}


  {showChat && <ChatModalFrame onClose={closeChatWindow}>{supportMode ? <><div className='chat-left support-thread-list'><div className='auth-switch'><button className={supportSection==='chat'?'active':''} onClick={()=>setSupportSection('chat')}>Чат</button><button className={supportSection==='complaints'?'active':''} onClick={()=>setSupportSection('complaints')}>Скарги {complaints.length ? '('+complaints.length+')' : ''}</button></div><div className='chat-list'>{chatThreads.filter(th=>th.type==='support').map(th => <button key={th.roomId} className={'chat-card '+(chatRoom===th.roomId?'selected ':'')+((chatNotifications[th.roomId]||Number(th.unreadCount||0)>0)?'new':'')} onClick={()=>{setSupportSection('chat');setChatRoom(th.roomId);setChatNotifications(prev=>({...prev,[th.roomId]:false}));loadChatRoomMessages(th.roomId).catch(()=>null)}}><img src='/media/icons/communication.png' alt='Підтримка'/><div><b>{th.title || 'Звернення користувача'}</b><div>{th.messageCount || 0} повідомлень {th.unreadCount ? <span className='unread-chip'>{th.unreadCount}</span> : null}</div></div></button>)}</div>{(store.user as any).isAdmin && moderationListings.length>0 && <div className='support-tasks'><h4>Завдання модерації</h4>{moderationListings.map(i=><div className='support-task' key={i._id}><button onClick={async()=>{await openListing(i._id)}}><img src={i.imageUrl} alt={i.title}/><span><b>{i.title}</b><em>{priceText(i)}</em><small>{i.status}</small></span></button><div><button onClick={async()=>{await openListing(i._id)}}>Переглянути картку</button></div></div>)}</div>}</div><div className='chat-right support-chat-full'><div className='chat-head'><b><img src='/media/icons/communication.png' alt='Підтримка'/> Чат підтримки</b><div className='chat-head-actions'><button onClick={hideCurrentChat} disabled={!chatRoom}>Видалити чат</button><button className='icon-btn' onClick={closeChatWindow}><img src='/media/icons/undo.png' alt='Закрити' style={{width:20}}/></button></div></div>{supportSection==='chat' ? <><div className='chat-messages' ref={chatMessagesContainerRef}>{chatMessages.filter(m=>m.roomId===chatRoom).map((m,i)=><div key={i} data-message-id={m.id || ''} data-unread-incoming={!m.mine && !m.readAt && !m.deletedAt ? 'true' : undefined} className={'chat-msg '+(m.mine?'mine ':'')+(highlightMessageId===m.id?'highlight':'')}><small>{roleBadge(m.senderIsAdmin,m.senderIsActivated)} {m.mine?'Ви':(m.nickname||'Користувач')}</small>{editingMessageId===m.id ? <div className='message-edit'><input value={editingMessageText} onChange={e=>setEditingMessageText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter') editChatMessage(m.id)}}/><button onClick={()=>editChatMessage(m.id)}>Зберегти</button><button onClick={()=>{setEditingMessageId('');setEditingMessageText('')}}>Скасувати</button></div> : <div>{m.text}</div>}{m.editedAt && !m.deletedAt && <em className='message-meta'>Змінено {new Date(m.editedAt).toLocaleString()}</em>}{m.mine && m.id && !m.deletedAt && <div className='message-actions'><button onClick={()=>{setEditingMessageId(m.id || '');setEditingMessageText(m.text)}}>Редагувати</button><button onClick={()=>deleteChatMessage(m.id)}>Видалити</button>{m.readAt && <span>Переглянуто</span>}</div>}{m.attachmentUrl && <a href={m.attachmentUrl} target='_blank' rel='noreferrer'><img className='chat-attachment' src={m.attachmentUrl} alt={m.attachmentName||'Вкладення'}/></a>}{m.selectionJson && <div className='selection-note'>Область проблеми прикріплена</div>}</div>)}</div><div className='chat-send support-send'><button type='button' onClick={()=>attachFullPageProblem('support')}>Знімок сторінки</button><label className='file-chip'>Фото<input type='file' accept='image/*' multiple onChange={e=>setChatAttachments(Array.from(e.target.files || []).slice(0,10))} /></label>{chatAttachments.length>0 && <div className='attachment-preview-row'>{chatAttachments.map((file,idx)=><span className='attachment-preview' key={file.name+idx}><img src={URL.createObjectURL(file)} alt={file.name}/><button type='button' onClick={()=>setChatAttachments(prev=>prev.filter((_,i)=>i!==idx))}>{'\u00d7'}</button></span>)}</div>}<input value={chatInput} maxLength={400} onKeyDown={e=>{if(e.key==='Enter') sendChatMessage()}} onChange={e=>setChatInput(e.target.value.slice(0,400))} placeholder={chatRoom?'Напишіть повідомлення...':'Оберіть звернення'} disabled={!chatRoom} /><button disabled={!chatRoom} onClick={()=>sendChatMessage()}><img src='/media/icons/send.png' alt='Надіслати' style={{width:20}}/></button></div></> : <div className='complaint-list'>{complaints.map(c=><button key={c.id} onClick={()=>c.listingId ? openListing(c.listingId) : undefined}><b>{c.userEmail ? c.userEmail+' - ' : ''}{c.listingTitle || 'Скарга на оголошення'} <small>#{c.listingId}</small></b><span>{c.text}</span>{(c.listingImageUrl || c.attachmentUrl) && <img src={c.listingImageUrl || c.attachmentUrl} alt='Скарга'/>}{c.attachmentUrl && c.listingImageUrl && <img src={c.attachmentUrl} alt='Вкладення до скарги'/>}{c.selectionJson && <em>Область проблеми вибрана</em>}{c.roomId && <em onClick={(e)=>{e.stopPropagation();setSupportSection('chat');setChatRoom(c.roomId)}}>Відкрити чат скарги</em>}{(store.user as any).isAdmin && <span className='resolve-complaint' onClick={async(e)=>{e.stopPropagation();await ListingService.resolveComplaint(c.id);setComplaints((await ListingService.fetchComplaints()).data)}}>Вирішено</span>}</button>)}</div>}</div></> : <><div className='chat-left'><div className='auth-switch'><button className={chatTab==='sell'?'active':''} onClick={()=>{setChatTab('sell');setChatRoom('');window.history.pushState({}, '', '/myaccount/answers/?my_ads=0')}}>Продаж</button><button className={chatTab==='buy'?'active':''} onClick={()=>{setChatTab('buy');setChatRoom('');window.history.pushState({}, '', '/myaccount/answers/?my_ads=1')}}>Покупки</button></div><div className='chat-list'>{chatThreads.filter(th=>th.type===chatTab).map(th => <button key={th.roomId} className={'chat-card '+(chatRoom===th.roomId?'selected ':'')+((chatNotifications[th.roomId]||Number(th.unreadCount||0)>0)?'new':'')} onClick={()=>{setChatRoom(th.roomId);setChatNotifications(prev=>({...prev,[th.roomId]:false}));loadChatRoomMessages(th.roomId).catch(()=>null)}}><img src={th.imageUrl} alt={th.title} /><div><b>{th.title}</b><div>{th.type==='buy'?'Покупка':'Продаж'} {th.userTitle ? <small className='chat-party'>з {th.userTitle}</small> : null} {th.unreadCount ? <span className='unread-chip'>{th.unreadCount}</span> : null}</div></div></button>)}</div></div><div className='chat-right'><div className='chat-head'><b>Повідомлення користувачів</b><button onClick={hideCurrentChat} disabled={!chatRoom}>Видалити чат</button><button className='icon-btn' onClick={closeChatWindow}><img src='/media/icons/undo.png' alt='Закрити' style={{width:20}}/></button></div><div className='chat-messages' ref={chatMessagesContainerRef}>{chatMessages.filter(m=>m.roomId===chatRoom).map((m,i)=><div key={i} data-message-id={m.id || ''} data-unread-incoming={!m.mine && !m.readAt && !m.deletedAt ? 'true' : undefined} className={'chat-msg '+(m.mine?'mine ':'')+(highlightMessageId===m.id?'highlight':'')}><small>{roleBadge(m.senderIsAdmin,m.senderIsActivated)} {m.mine?'Ви':(m.nickname||'Користувач')}</small>{editingMessageId===m.id ? <div className='message-edit'><input value={editingMessageText} onChange={e=>setEditingMessageText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter') editChatMessage(m.id)}}/><button onClick={()=>editChatMessage(m.id)}>Зберегти</button><button onClick={()=>{setEditingMessageId('');setEditingMessageText('')}}>Скасувати</button></div> : <div>{m.text}</div>}{m.editedAt && !m.deletedAt && <em className='message-meta'>Змінено {new Date(m.editedAt).toLocaleString()}</em>}{m.mine && m.id && !m.deletedAt && <div className='message-actions'><button onClick={()=>{setEditingMessageId(m.id || '');setEditingMessageText(m.text)}}>Редагувати</button><button onClick={()=>deleteChatMessage(m.id)}>Видалити</button>{m.readAt && <span>Переглянуто</span>}</div>}{m.attachmentUrl && <a href={m.attachmentUrl} target='_blank' rel='noreferrer'><img className='chat-attachment' src={m.attachmentUrl} alt={m.attachmentName||'Вкладення'}/></a>}</div>)}</div><div className='chat-send'><label className='file-chip'>Фото<input type='file' accept='image/*' multiple onChange={e=>setChatAttachments(Array.from(e.target.files || []).slice(0,10))} /></label>{chatAttachments.length>0 && <div className='attachment-preview-row'>{chatAttachments.map((file,idx)=><span className='attachment-preview' key={file.name+idx}><img src={URL.createObjectURL(file)} alt={file.name}/><button type='button' onClick={()=>setChatAttachments(prev=>prev.filter((_,i)=>i!==idx))}>{'\u00d7'}</button></span>)}</div>}<input onKeyDown={e=>{if(e.key==='Enter' && chatRoom && chatThreads.find(t=>t.roomId===chatRoom)?.canWrite && (chatInput.trim() || chatAttachments.length)) sendChatMessage()}} disabled={!chatRoom || !chatThreads.find(t=>t.roomId===chatRoom)?.canWrite} value={chatInput} maxLength={400} onChange={e=>setChatInput(e.target.value.slice(0,400))} placeholder={!chatRoom?'Оберіть чат':(chatThreads.find(t=>t.roomId===chatRoom)?.canWrite?'Напишіть повідомлення...':'Дочекайтесь першого повідомлення покупця')} /><button disabled={!chatRoom || !chatThreads.find(t=>t.roomId===chatRoom)?.canWrite} onClick={()=>sendChatMessage()}><img src='/media/icons/send.png' alt='Надіслати' style={{width:20}}/></button></div></div></>}</ChatModalFrame>}
  {toDelete && <div className='confirm-box' onClick={(e)=>e.stopPropagation()}><p>Щоб видалити товар, впишіть назву: <b>({toDelete.title})</b></p><input value={confirmText} onChange={e=>setConfirmText(e.target.value)} /><button onClick={confirmDelete}>Видалити</button><button onClick={()=>setToDelete(null)}>Скасувати</button></div>}

  {adminDeleteTarget && <div className='confirm-box' onClick={(e)=>e.stopPropagation()}><h3>{adminDeleteTarget.action==='delete'?'Видалити оголошення':adminDeleteTarget.action==='deactivate'?'Деактивувати оголошення':'Активувати оголошення'}</h3><p>Впишіть точну назву оголошення: <b>{adminDeleteTarget.listing.title}</b></p><input value={adminDeleteTitle} onChange={e=>setAdminDeleteTitle(e.target.value)} placeholder='Назва оголошення'/>{adminDeleteTarget.action!=='activate' && <textarea value={adminDeleteReason} onChange={e=>setAdminDeleteReason(e.target.value)} placeholder='Причина для користувача і бази даних'/>}<button className='primary' onClick={confirmAdminListingAction}>Підтвердити</button><button onClick={()=>setAdminDeleteTarget(null)}>Скасувати</button></div>}
  {view==='listing' && currentListing && <div className={'detail '+(currentListing.status && currentListing.status!=='active' ? (currentListing.status === 'sold' || currentListing.status === 'deleted' ? 'listing-archived' : 'listing-muted') : '')}><button onClick={goBack}><img src='/media/icons/undo_back.png' alt='Назад' style={{width:24}}/></button>{currentListing.status && currentListing.status!=='active' && <div className='status-ribbon'>{listingStatusText(currentListing)}{currentListing.moderationReason ? ': '+currentListing.moderationReason : ''}</div>}<h2 className='listing-title-heading'><span>{'\u041d\u0430\u0437\u0432\u0430 \u043e\u0433\u043e\u043b\u043e\u0448\u0435\u043d\u043d\u044f'}:</span> {currentListing.title}</h2><div className='detail-image-frame'><img src={detailImages[activeDetailImage]} alt={currentListing.title}/></div>{detailImages.length > 1 && <div className='thumb-wrap'><button className='nav-btn icon-btn' onClick={()=>setActiveDetailImage((activeDetailImage - 1 + detailImages.length) % detailImages.length)}><img src='/media/icons/left-arrow.png' alt='Попереднє фото' style={{width:34}}/></button><div className='thumb-track'>{detailImages.map((src, idx) => <button className={'thumb '+(idx===activeDetailImage?'active':'')} key={src+idx} onClick={()=>setActiveDetailImage(idx)}><img src={src} alt={'Мініатюра '+(idx+1)} /></button>)}</div><button className='nav-btn icon-btn' onClick={()=>setActiveDetailImage((activeDetailImage + 1) % detailImages.length)}><img src='/media/icons/left-arrow.png' alt='Наступне фото' style={{width:34,transform:'scaleX(-1)'}}/></button></div>}<p className='seller-line'><b>Продавець:</b> {currentListing.ownerEmail || 'не вказано'} {roleBadge(currentListing.ownerIsAdmin,currentListing.ownerIsActivated)} {currentListing.ownerId && <button className='icon-btn seller-profile-btn' onClick={()=>openSellerProfile(currentListing.ownerId || '')}><img src={currentListing.ownerAvatarUrl || defaultAvatar} alt='Профіль продавця' onError={safeImg} style={{width:26,height:26}}/></button>}</p><p><b>Телефон:</b> {currentListing.phone || 'не вказано'}</p><p><b>Категорія:</b> {currentListing.category || 'не вказано'}</p><p><b>Опис:</b> {currentListing.description}</p><p><b>Локація:</b> {currentListing.location}</p><p><b>Ціна:</b> {priceText(currentListing)}</p><p><b>Додано:</b> {new Date(currentListing.createdAt||'').toLocaleString()}</p><div className='listing-actions'>{currentListing.ownerId !== store.user.id && <button className='primary' onClick={async()=>{if(!requireAuth('Увійдіть, щоб написати продавцю')) return; const r=await ListingService.startChat(currentListing._id,'buy');setSupportMode(false);const openedThread={roomId:r.data.roomId,title:currentListing.title,imageUrl:currentListing.imageUrl,type:'buy' as const,canWrite:true,userId:currentListing.ownerId || null,userTitle:currentListing.ownerNickname || currentListing.ownerEmail || 'Продавець',messageCount:0,unreadCount:0};pinnedChatRef.current={roomId:r.data.roomId,type:'buy'};setChatTab('buy');setChatThreads(prev=> prev.some(t=>t.roomId===r.data.roomId)?prev:[openedThread,...prev]);setChatRoom(r.data.roomId);setShowChat(true);window.history.pushState({}, '', '/myaccount/answers/?my_ads=1'); focusElement('.chat-window')}}>Чат</button>}{currentListing.ownerId !== store.user.id && <button style={{background:cartIds[currentListing._id]?'#f2c94c':''}} onClick={async()=>{if(!requireAuth('Увійдіть, щоб додати товар у кошик')) return; await ListingService.toggleCart(currentListing._id);setCartIds(prev=>({...prev,[currentListing._id]:!prev[currentListing._id]}));}}>{cartIds[currentListing._id]?'Додано в кошик':'Додати в кошик'}</button>}<button style={{background:favoriteIds[currentListing._id]?'#f2c94c':''}} onClick={async()=>{if(!requireAuth('Увійдіть, щоб додати товар в обране')) return; await ListingService.toggleFavorite(currentListing._id);setFavoriteIds(prev=>({...prev,[currentListing._id]:!prev[currentListing._id]}));}}>{favoriteIds[currentListing._id]?'Додано в обране':'Додати в обране'}</button>{currentListing.ownerId !== store.user.id && <button onClick={async()=>{if(!requireAuth('Увійдіть, щоб оформити покупку')) return; const cart=(await ListingService.fetchCart()).data; setCheckoutItems([currentListing,...cart.filter(x=>x._id!==currentListing._id)]); setView('checkout');window.history.pushState({}, '', '/checkout'); window.scrollTo({top:0,behavior:'smooth'})}}>Купити</button>}<button onClick={()=>downloadListingImagesPdf(currentListing)}>Завантажити фото в PDF</button>{currentListing.ownerId !== store.user.id && <button onClick={()=>{if(!requireAuth('Увійдіть, щоб залишити скаргу')) return; setShowComplaint(true)}}>Поскаржитися</button>}{(store.user as any).isAdmin && <><button onClick={()=>openAdminListingAction(currentListing,'delete')}>Видалити оголошення</button>{currentListing.status && currentListing.status!=='active' ? <button className='primary' onClick={()=>openAdminListingAction(currentListing,'activate')}>Схвалити оголошення</button> : <button onClick={()=>openAdminListingAction(currentListing,'deactivate')}>Деактивувати оголошення</button>}</>}</div><div className='seller-review-link'><button onClick={()=>currentListing.ownerId && openSellerProfile(currentListing.ownerId)}>Переглянути профіль продавця та відгуки</button></div></div>}
  {showComplaint && currentListing && <div className='chat-modal' onClick={()=>setShowComplaint(false)}><div className='chat-window complaint-window' onClick={e=>e.stopPropagation()} style={{gridTemplateColumns:'1fr'}}><div className='chat-right'><h3>Скарга на оголошення</h3><textarea maxLength={1000} value={complaintText} onChange={e=>setComplaintText(e.target.value.slice(0,1000))} placeholder='Опишіть проблему для адміністратора' /><div className='complaint-tools'><label className='file-chip'>Додати фото<input type='file' accept='image/*' multiple onChange={e=>setComplaintImages(prev=>[...prev,...Array.from(e.target.files || [])].slice(0,10))} /></label>{complaintImages.length>0 && <div className='attachment-preview-row'>{complaintImages.map((file,idx)=><span className='attachment-preview' key={file.name+idx}><img src={URL.createObjectURL(file)} alt={file.name}/><button type='button' onClick={()=>setComplaintImages(prev=>prev.filter((_,i)=>i!==idx))}>{'\u00d7'}</button></span>)}</div>}<button onClick={()=>attachFullPageProblem('complaint')}>Знімок сторінки</button></div><button onClick={async()=>{try{if(!complaintText.trim()) return setError('Опишіть проблему перед надсиланням'); if(complaintText.length>1000) return setError('Скарга не може бути довшою за 1000 символів'); if(!canSendWithLimit(complaintSendLogRef, complaintText.length, 5000, 'Скарги')) return; const r=await ListingService.sendComplaint(currentListing._id, complaintText, complaintImages, complaintImages.some(file=>file.name.startsWith('problem-page-')) ? 'full-page-screenshot' : ''); setComplaintText(''); setComplaintImages([]); setShowComplaint(false); await openSupportChat(); if(r.data.roomId) setChatRoom(r.data.roomId); setSupportSection('complaints')}catch{setError('Не вдалося надіслати скаргу')}}}>Надіслати скаргу в підтримку</button></div></div></div>}
  {view==='sellerProfile' && publicProfile && <div className='detail seller-profile-view'><button onClick={goBack}><img src='/media/icons/undo_back.png' alt='Назад' style={{width:24}}/></button><div className='seller-profile-head'><img src={publicProfile.user.avatarUrl || defaultAvatar} alt='Профіль' onError={safeImg}/><div><h2>{publicProfile.user.nickname || publicProfile.user.email}</h2><p className='identity-line'>{publicProfile.user.email} {roleBadge(publicProfile.user.isAdmin, publicProfile.user.isActivated, false)}</p><div className='profile-rating'><b>{publicProfile.ratingAverage ? publicProfile.ratingAverage.toFixed(1) : '0.0'}</b><span>/5</span><div className='review-stars'>{[1,2,3,4,5].map(n=><img key={n} src='/media/icons/star-gold.svg' alt='Зірка' style={{opacity:n<=Math.round(publicProfile.ratingAverage || 0)?1:.25}}/>)}</div><small>{publicProfile.reviewCount} відгуків</small></div></div></div>{renderProfileStats(publicProfile)}<h3>Оголошення продавця</h3><div className='grid seller-listings'>{publicProfile.listings.map((i,idx)=><button className='tile' key={i._id+'-'+idx} onClick={()=>openListing(i._id)}><img src={i.imageUrl} alt={i.title}/><h3>{i.title}</h3><p>{priceText(i)}</p><small>{new Date(i.createdAt || '').toLocaleDateString()}</small></button>)}</div><h3>Відгуки про продавця</h3><div className='reviews-list'>{sellerReviews.map((r)=><div className='review-card rozetka-review' key={r.id}><div className='review-author'>{roleBadge(r.buyer_is_admin,r.buyer_is_activated)}<b>{r.buyer_nickname || r.buyer_email || 'Користувач'}</b><span>{r.created_at ? new Date(r.created_at).toLocaleDateString() : ''}</span></div><small>Відгук від покупця.</small>{(r.listing_title || r.listing_image_url) && <button className='review-product-card' onClick={()=>r.listing_id ? openListing(r.listing_id) : undefined}>{r.listing_image_url && <img src={r.listing_image_url} alt={r.listing_title || 'Оголошення'}/>}<span><b>{r.listing_title || 'Оголошення видалено'}</b>{r.listing_price !== null && r.listing_price !== undefined ? <em>{r.listing_price} грн</em> : null}</span></button>}<div className='review-stars'>{Array.from({length:r.rating || 0}).map((_,i)=><img key={i} src='/media/icons/star-gold.svg' alt='Зірка'/>)}</div><p>{r.comment || 'Без коментаря'}</p><p><b>Переваги:</b> {r.pros || '-'}</p><p><b>Недоліки:</b> {r.cons || '-'}</p><div className='review-replies'>{(r.replies||[]).map(rep=><div className='review-reply' key={rep.id}><small>{roleBadge(rep.isAdmin,rep.isActivated)} <b>{rep.nickname || rep.email}</b> {rep.createdAt ? new Date(rep.createdAt).toLocaleDateString() : ''}</small><div>{rep.text}</div></div>)}</div>{store.isAuth ? <div className='reply-box'><input value={replyDrafts[r.id] || ''} onChange={e=>setReplyDrafts(prev=>({...prev,[r.id]:e.target.value}))} placeholder='Відповісти'/><button onClick={()=>sendReviewReply(r.id)}>Відповісти</button></div> : <button className='reply-login' onClick={()=>requireAuth('Увійдіть, щоб відповісти на відгук')}>Увійдіть, щоб відповісти</button>}<div className='review-votes'><button className={'icon-btn '+(r.my_vote==='like'?'active-vote':'')} onClick={()=>voteReview(r.id,'like')}><img src='/media/icons/like.png' alt='Подобається' style={{width:16}}/> {r.likes || 0}</button><button className={'icon-btn '+(r.my_vote==='dislike'?'active-vote':'')} onClick={()=>voteReview(r.id,'dislike')}><img src='/media/icons/like.png' alt='Не подобається' style={{width:16,transform:'scaleY(-1)'}}/> {r.dislikes || 0}</button></div></div>)}</div></div>}
  {view==='checkout' && <div className='detail'><button onClick={goBack}>Назад</button><h2>Оформлення покупки</h2><div className='checkout-list'>{checkoutItems.map(i=><div key={i._id} className='checkout-card'><img src={i.imageUrl} alt={i.title}/><div><b>{i.title}</b><p>{priceText(i)}</p></div><button onClick={()=>setCheckoutItems(prev=>prev.filter(x=>x._id!==i._id))}>Видалити з оформлення</button></div>)}</div><h3>Разом: {totalByCurrencyText(checkoutItems)}</h3><h3>Дані картки</h3><input placeholder='Номер картки' /><input placeholder='??/??' /><input placeholder='CVV' /><button className='primary' disabled={!checkoutItems.length} onClick={async()=>{await ListingService.buy(checkoutItems.map(i=>i._id)); alert('Покупку підтверджено'); setCheckoutItems([]); sessionStorage.removeItem('checkoutItems'); await openProfileSection('reviews')}}>Підтвердити покупку</button></div>}
  {view==='about' && <div className='detail'><button onClick={goBack}><img src='/media/icons/undo_back.png' alt='Назад' style={{width:24}}/></button><h2>Про компанію</h2><p>Компанія була створена 1 січня 2024 року о 09:00 UTC.</p></div>}
  {view==='profile' && profile && <div className='detail profile-detail'><button onClick={goBack}><img src='/media/icons/undo_back.png' alt='Назад' style={{width:24}}/></button><h2>Профіль користувача</h2><div className='profile-avatar-row'><span className='profile-avatar-frame'>{profile.avatarUrl ? <img src={profile.avatarUrl} alt='Аватар' onError={safeImg}/> : <span>{(profile.nickname || profile.email || '?').slice(0,1).toUpperCase()}</span>}</span><label className='file-chip'>Аватар<input type='file' accept='image/*' onChange={async e=>{const file=e.target.files?.[0]; if(file){const p=await UserService.updateAvatar(file);setProfile(p.data);store.setUser({...store.user, avatarUrl:p.data.avatarUrl} as any)}}}/></label></div><p className='identity-line'>Електронна пошта: {profile.email} {roleBadge(profile.isAdmin, profile.isActivated, false)}</p><p className='identity-line'>Нікнейм: {profile.nickname || profile.email.split('@')[0]} {roleBadge(profile.isAdmin, profile.isActivated)}</p><div className='profile-edit-row' style={{display:'flex',gap:8,margin:'8px 0'}}><input placeholder='Новий нікнейм' value={newNickname} onChange={e=>setNewNickname(e.target.value)} /><button onClick={async()=>{try{const p=await UserService.updateNickname(newNickname || profile.email.split('@')[0]);setProfile(p.data);setNewNickname('');setError('')}catch(e:any){setError(e?.response?.data?.message || 'Не вдалося змінити нікнейм');focusElement('.profile-edit-row input')}}}>Змінити імʼя</button>{(store.user as any).isAdmin && <button onClick={async()=>{if(adminUsers.length){setAdminUsers([]);setSelectedAdminUser(null);return} setAdminUsers((await UserService.fetchUsers()).data as any)}}>{adminUsers.length ? <img src='/media/icons/undo.png' alt='Закрити список користувачів' style={{width:18}}/> : 'Отримати всіх користувачів'}</button>}</div>{moderationListings.length>0 && <div className='admin-review-list'><h3>Оголошення на перевірці адміністратора</h3>{moderationListings.map(i=><div className='admin-row' key={i._id}><button onClick={()=>openListing(i._id)}>{i.title} | {i.status}</button><button onClick={()=>openAdminListingAction(i,'activate')}>Активувати</button><button onClick={()=>openAdminListingAction(i,'delete')}>Видалити</button></div>)}</div>}{adminUsers.length>0 && <div className='admin-panel'><div className='admin-users'><input className='admin-user-search' placeholder='Пошук за поштою або ніком' value={adminUserSearch} onChange={e=>setAdminUserSearch(e.target.value)} />{adminUsers.filter(u=>`${u.email || ''} ${u.nickname || ''}`.toLowerCase().includes(adminUserSearch.toLowerCase())).map(u=><button key={u.id} className={selectedAdminUser?.user.id===u.id?'selected':''} onClick={()=>openAdminUser(u.id)}><span className='admin-user-title'>{u.email}{roleBadge(u.isAdmin,u.isActivated)}</span><small>{u.bannedPermanent?' | заблоковано назавжди':u.bannedUntil?' | заблоковано до '+new Date(u.bannedUntil).toLocaleString():''}</small></button>)}</div>{selectedAdminUser && <div className='admin-detail'><h3>Користувач: {selectedAdminUser.user.email} {roleBadge(selectedAdminUser.user.isAdmin,selectedAdminUser.user.isActivated)}</h3><p>Статус: {selectedAdminUser.user.bannedPermanent?'заблокований назавжди':selectedAdminUser.user.bannedUntil?'заблокований до '+new Date(selectedAdminUser.user.bannedUntil).toLocaleString():'активний'}</p><div className='admin-actions'>{canModerateSelectedAdminUser && <><input type='number' min='1' value={adminBanMinutes} onChange={e=>setAdminBanMinutes(e.target.value)} placeholder='Блокування у хвилинах'/><input value={adminBanReason} onChange={e=>setAdminBanReason(e.target.value)} placeholder='Причина'/><button onClick={async()=>{await UserService.banUser(selectedAdminUser.user.id,{minutes:Number(adminBanMinutes)||1,reason:adminBanReason}); await refreshAdminUser()}}>Заблокувати на хвилини</button><button onClick={async()=>{await UserService.banUser(selectedAdminUser.user.id,{permanent:true,reason:adminBanReason}); await refreshAdminUser()}}>Заблокувати назавжди</button><button onClick={async()=>{await UserService.unbanUser(selectedAdminUser.user.id); await refreshAdminUser()}}>Розблокувати</button><button onClick={async()=>{if(window.confirm('Видалити користувача назавжди?')){await UserService.deleteUser(selectedAdminUser.user.id); setSelectedAdminUser(null); setAdminUsers((await UserService.fetchUsers()).data as IUserProfile[])}}}>Видалити користувача</button></>}{canChangeSelectedAdminAccess && <button onClick={async()=>{await UserService.setAdmin(selectedAdminUser.user.id, !selectedAdminUser.user.isAdmin); await refreshAdminUser()}}>{selectedAdminUser.user.isAdmin ? 'Забрати права адміністратора':'Видати права адміністратора'}</button>}</div><h4>Оголошення користувача</h4><div className='admin-list'>{selectedAdminUser.listings.map(l=><div key={l.id} className='admin-row'><button onClick={()=>openListing(l.id)}>{l.title} | {l.price} грн</button><button onClick={()=>openAdminListingAction({ _id:l.id, title:l.title, description:l.description, price:l.price, imageUrl:l.imageUrl, createdAt:l.createdAt, status:l.status as any, moderationReason:l.moderationReason } as IListing,'delete')}>Видалити оголошення</button><button onClick={()=>openAdminListingAction({ _id:l.id, title:l.title, description:l.description, price:l.price, imageUrl:l.imageUrl, createdAt:l.createdAt, status:l.status as any, moderationReason:l.moderationReason } as IListing,l.status==='deactivated'?'activate':'deactivate')}>{l.status==='deactivated'?'Активувати':'Деактивувати'}</button></div>)}</div><h4>Чати користувача</h4><div className='admin-chat-list'>{selectedAdminUser.chats.map(c=><div key={c.roomId} className='admin-chat-item'><button className={adminChatRoom===c.roomId?'selected':''} onClick={()=>setAdminChatRoom(c.roomId)}>{c.topic==='support'?'Підтримка':'Оголошення'}: {c.listingTitle || c.roomId} ({c.messageCount})</button>{adminChatRoom===c.roomId && <div className='admin-chat-log'>{selectedAdminUser.messages.filter(m=>m.roomId===c.roomId).map((m,i)=><div key={i} className={String(m.senderUserId||'')===String(selectedAdminUser.user.id)?'admin-msg target':'admin-msg'}><small>{m.nickname} {m.createdAt ? new Date(m.createdAt).toLocaleString() : ''}</small><div>{m.text}</div>{m.attachmentUrl && <a href={m.attachmentUrl} target='_blank' rel='noreferrer'><img className='chat-attachment' src={m.attachmentUrl} alt={m.attachmentName||'Вкладення'}/></a>}{m.selectionJson && <em className='selection-note'>Область проблеми прикріплена</em>}</div>)}</div>}</div>)}</div><h4>Коментарі / відгуки користувача</h4><div className='admin-list'>{selectedAdminUser.reviews.map(r=><button key={r.id} onClick={()=>r.listingId ? openListing(r.listingId) : undefined}>{r.comment || 'Без коментаря'}<small> | {r.listingTitle || 'оголошення видалено'} | оцінка {r.rating}</small></button>)}</div></div>}</div>}<p>Телефон: {profile.phone || 'не вказано'}</p><div style={{display:'flex',gap:8,marginBottom:8}}><input inputMode='tel' pattern='[+0-9]*' placeholder='Новий номер телефону' value={newPhone} onChange={e=>setNewPhone(e.target.value.replace(/(?!^)\+/g,'').replace(/[^\d+]/g,''))} /><button onClick={async()=>{const p=await UserService.updatePhone(newPhone);setProfile(p.data);setNewPhone('')}}>{profile.phone?'Змінити номер':'Додати номер'}</button></div><div className='currency-picker'><label>Валюта відображення</label><select value={selectedCurrency} onChange={async e=>{const p=await UserService.updateCurrency(e.target.value);setProfile(p.data)}}>{SUPPORTED_CURRENCIES.map(c=><option key={c} value={c}>{c}</option>)}</select></div><p>Створено акаунт: {profile.createdAt ? new Date(profile.createdAt).toLocaleString() : '-'}</p><ProfileTabs active={profileSection} pendingReviewCount={pendingReviewCount} onSelect={openProfileSection} /><h3>{profileSection==='my'?'Мої оголошення':profileSection==='history'?'Історія перегляду':profileSection==='favorites'?'Обране':profileSection==='cart'?'Кошик':profileSection==='purchases'?'Історія покупок':profileSection==='reviews'?'Очікують відгуку':profileSection==='myReviews'?'Мої відгуки':'Історія продажів'}</h3>{profileSection==='myReviews' && <div className='my-reviews-panel'><section><h4>Відгуки про мене</h4>{myReviewLists.received.length ? myReviewLists.received.map(r=>renderMyReviewCard(r,'received')) : <p>Поки немає відгуків про вас.</p>}</section><section><h4>Відгуки, які я залишив</h4>{myReviewLists.given.length ? myReviewLists.given.map(r=>renderMyReviewCard(r,'given')) : <p>Ви ще не залишали відгуків.</p>}</section></div>}<div className='grid'>{listings.map((i,idx)=><div className={'tile '+(i.status&&i.status!=='active' ? (i.status==='sold' || i.status==='deleted' ? 'archived' : 'deactivated') : '')} key={`${i._id}-${idx}`}>{i.status&&i.status!=='active'&&<span className='tile-status'>{listingStatusText(i) || 'Недоступно'}</span>}<button className='tile-link' onClick={()=>openListing(i._id)}><img src={i.imageUrl} alt={i.title}/><h3>{i.title}</h3><p>{priceText(i)}</p><small>{(i as any).viewedAt ? `Переглянуто: ${new Date((i as any).viewedAt).toLocaleString()}` : (i as any).purchasedAt ? `Куплено: ${new Date((i as any).purchasedAt).toLocaleString()}` : (i as any).soldAt ? `Продано: ${new Date((i as any).soldAt).toLocaleString()}` : ''}</small>{profileSection==='purchases' && <small className='party-line'>Продавець: {i.ownerNickname || i.ownerEmail || 'не вказано'} {i.ownerEmail ? `(${i.ownerEmail})` : ''}</small>}{profileSection==='sales' && <small className='party-line'>Покупець: {i.buyerNickname || i.buyerEmail || 'не вказано'} {i.buyerEmail ? `(${i.buyerEmail})` : ''}</small>}</button>{profileSection==='my' && <div className='tile-actions'>{i.status==='sold' ? <button className='primary' onClick={async()=>{await ListingService.relist(i._id);setListings((await ListingService.fetchMyListings()).data)}}>Виставити ще раз</button> : <button onClick={()=>openEdit(i)}>Редагувати</button>}<button onClick={()=>openDelete(i)}>Видалити</button></div>}{profileSection==='cart' && <div className='tile-actions'><button className='primary' onClick={()=>{setCheckoutItems(listings);setView('checkout');window.history.pushState({}, '', '/checkout')}}>Купити</button><button onClick={async()=>{await ListingService.toggleCart(i._id);setListings(prev=>prev.filter(x=>x._id!==i._id));setCartIds(prev=>({...prev,[i._id]:false}))}}>Видалити з кошика</button></div>}{profileSection==='favorites' && <div className='tile-actions'><button onClick={async()=>{await ListingService.toggleFavorite(i._id);setListings(prev=>prev.filter(x=>x._id!==i._id));setFavoriteIds(prev=>({...prev,[i._id]:false}))}}>Видалити з обраного</button></div>}{profileSection==='reviews' && <div className='pending-review-card'><label>Оцінка продавця</label><div className='heart-rating'>{[1,2,3,4,5].map(n=><button type='button' key={n} className={n <= (purchaseReviewDrafts[purchaseReviewKey(i)]?.rating || 5) ? 'active' : ''} onClick={()=>setPurchaseReviewDrafts(prev=>({...prev,[purchaseReviewKey(i)]:{rating:n,comment:prev[purchaseReviewKey(i)]?.comment||'',pros:prev[purchaseReviewKey(i)]?.pros||'',cons:prev[purchaseReviewKey(i)]?.cons||''}}))}><img src='/media/icons/heart.png' alt={String(n)}/></button>)}</div><input placeholder='Ваш відгук після покупки' value={purchaseReviewDrafts[purchaseReviewKey(i)]?.comment || ''} onChange={e=>setPurchaseReviewDrafts(prev=>({...prev,[purchaseReviewKey(i)]:{rating:prev[purchaseReviewKey(i)]?.rating||5,comment:e.target.value,pros:prev[purchaseReviewKey(i)]?.pros||'',cons:prev[purchaseReviewKey(i)]?.cons||''}}))}/><input placeholder='Переваги' value={purchaseReviewDrafts[purchaseReviewKey(i)]?.pros || ''} onChange={e=>setPurchaseReviewDrafts(prev=>({...prev,[purchaseReviewKey(i)]:{rating:prev[purchaseReviewKey(i)]?.rating||5,comment:prev[purchaseReviewKey(i)]?.comment||'',pros:e.target.value,cons:prev[purchaseReviewKey(i)]?.cons||''}}))}/><input placeholder='Недоліки' value={purchaseReviewDrafts[purchaseReviewKey(i)]?.cons || ''} onChange={e=>setPurchaseReviewDrafts(prev=>({...prev,[purchaseReviewKey(i)]:{rating:prev[purchaseReviewKey(i)]?.rating||5,comment:prev[purchaseReviewKey(i)]?.comment||'',pros:prev[purchaseReviewKey(i)]?.pros||'',cons:e.target.value}}))}/><button className='primary' onClick={()=>submitPurchaseReview(i)}>Залишити відгук</button></div>}</div>)}</div></div>}
  {(appliedFilters.minPrice || appliedFilters.maxPrice || appliedFilters.category || appliedFilters.sortBy!=='newest') && <div className='filter-chips'>
    {appliedFilters.minPrice && <span className='chip'><span>Ціна від: {appliedFilters.minPrice}</span><button className='icon-btn chip-remove' aria-label='Прибрати фільтр' onClick={()=>{const n={...appliedFilters,minPrice:''};setAppliedFilters(n);setFilters(n);loadListings(search,n)}}><img src='/media/icons/undo.png' alt='' style={{width:14}}/></button></span>}
    {appliedFilters.maxPrice && <span className='chip'><span>Ціна до: {appliedFilters.maxPrice}</span><button className='icon-btn chip-remove' aria-label='Прибрати фільтр' onClick={()=>{const n={...appliedFilters,maxPrice:''};setAppliedFilters(n);setFilters(n);loadListings(search,n)}}><img src='/media/icons/undo.png' alt='' style={{width:14}}/></button></span>}
    {appliedFilters.category && <span className='chip'><span>Категорія: {appliedFilters.category}</span><button className='icon-btn chip-remove' aria-label='Прибрати фільтр' onClick={()=>{const n={...appliedFilters,category:''};setAppliedFilters(n);setFilters(n);loadListings(search,n)}}><img src='/media/icons/undo.png' alt='' style={{width:14}}/></button></span>}
    {appliedFilters.sortBy!=='newest' && <span className='chip'><span>Сортування: {sortLabel(appliedFilters.sortBy)}</span><button className='icon-btn chip-remove' aria-label='Прибрати фільтр' onClick={()=>{const n={...appliedFilters,sortBy:'newest'};setAppliedFilters(n);setFilters(n);loadListings(search,n)}}><img src='/media/icons/undo.png' alt='' style={{width:14}}/></button></span>}
    <button onClick={()=>{const n={ minPrice: '', maxPrice: '', category: '', sortBy: 'newest' };setAppliedFilters(n);setFilters(n);loadListings(search,n)}}>Очистити все</button>
  </div>}
  {view==='home' && <div className='grid'>{listings.map((i,idx)=><ListingTile key={`${i._id}-${idx}`} listing={i} priceText={priceText} onOpen={openListing} />)}</div>}
  {problemSelectorOpen && <div className='problem-overlay' onMouseMove={e=>{if(!dragProblem)return; const dx=e.clientX-dragProblem.startX; const dy=e.clientY-dragProblem.startY; const r=dragProblem.rect; const min=44; const maxW=window.innerWidth; const maxH=window.innerHeight; if(dragProblem.mode==='move') setProblemRect({...r,x:Math.max(0,Math.min(maxW-r.w,r.x+dx)),y:Math.max(0,Math.min(maxH-r.h,r.y+dy))}); if(dragProblem.mode==='right') setProblemRect({...r,w:Math.max(min,Math.min(maxW-r.x,r.w+dx))}); if(dragProblem.mode==='bottom') setProblemRect({...r,h:Math.max(min,Math.min(maxH-r.y,r.h+dy))}); if(dragProblem.mode==='left') setProblemRect({x:Math.max(0,Math.min(r.x+dx,r.x+r.w-min)),y:r.y,w:Math.max(min,r.w-dx),h:r.h}); if(dragProblem.mode==='top') setProblemRect({x:r.x,y:Math.max(0,Math.min(r.y+dy,r.y+r.h-min)),w:r.w,h:Math.max(min,r.h-dy)}); if(dragProblem.mode==='corner') setProblemRect({...r,w:Math.max(min,Math.min(maxW-r.x,r.w+dx)),h:Math.max(min,Math.min(maxH-r.y,r.h+dy))})}} onMouseUp={()=>setDragProblem(null)}><div className='problem-help'>Перетягніть червону область на місце проблеми, за потреби змініть її розмір.</div><div className='problem-rect' style={{left:problemRect.x,top:problemRect.y,width:problemRect.w,height:problemRect.h}} onMouseDown={e=>setDragProblem({mode:'move',startX:e.clientX,startY:e.clientY,rect:problemRect})}><span className='resize-handle right' onMouseDown={e=>{e.stopPropagation();setDragProblem({mode:'right',startX:e.clientX,startY:e.clientY,rect:problemRect})}}/><span className='resize-handle bottom' onMouseDown={e=>{e.stopPropagation();setDragProblem({mode:'bottom',startX:e.clientX,startY:e.clientY,rect:problemRect})}}/><span className='resize-handle left' onMouseDown={e=>{e.stopPropagation();setDragProblem({mode:'left',startX:e.clientX,startY:e.clientY,rect:problemRect})}}/><span className='resize-handle top' onMouseDown={e=>{e.stopPropagation();setDragProblem({mode:'top',startX:e.clientX,startY:e.clientY,rect:problemRect})}}/><span className='resize-handle corner' onMouseDown={e=>{e.stopPropagation();setDragProblem({mode:'corner',startX:e.clientX,startY:e.clientY,rect:problemRect})}}/></div><div className='problem-actions' style={{left:Math.min(window.innerWidth-360, Math.max(0, problemRect.x+10)),top:Math.max(0, Math.min(window.innerHeight-64, problemRect.y+problemRect.h-58)),width:Math.min(Math.max(problemRect.w-20,180),340)}}><button onClick={()=>{setProblemSelectorOpen(false); if(problemTarget==='support') setShowChat(true); else setShowComplaint(true)}}>Скасувати</button><button className='primary' onClick={finishProblemSelection}>Додати область</button></div></div>}
  </div><footer className='footer'><div><b>Підтримка:</b> чат з техпідтримкою та питання щодо сервісів самообслуговування.</div><div style={{display:'flex',gap:10}}><a href='#support' className='footer-chat-link' onClick={async(e)=>{e.preventDefault(); await openSupportChat()}}>Чат підтримки {store.isAuth && Number(chatSummary?.supportCount || 0)>0 && <b>{chatSummary?.supportCount}</b>}</a><a href='#about' onClick={async(e)=>{e.preventDefault();await closeChatWindow();setShowComplaint(false);setProblemSelectorOpen(false);setShowFilters(false);setShowForm(false);setView('about')}}>Про компанію</a></div></footer></div>
}

export default observer(App)
