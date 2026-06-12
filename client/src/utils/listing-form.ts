export const SUPPORTED_CURRENCIES = ['UAH','USD','EUR','PLN','GBP','CHF','JPY','CNY','CAD','AUD','SEK','NOK','DKK','CZK','HUF','RON','BGN','TRY','ILS','AED','KZT']

export const CATEGORIES = ['Техніка', 'Робота', 'Доставка', 'Цифрові послуги']

export type ListingFormValues = {
  title: string
  description: string
  price: string
  location: string
  category: string
}

export type ListingFormErrors = {
  title: boolean
  description: boolean
  price: boolean
  location: boolean
  category: boolean
}

export function getListingCategoryExamples(category: string) {
  if (category === 'Робота') {
    return {
      title: 'Приклад: Вантажник на склад',
      description: 'Приклад: графік 5/2, ставка 1200 грн/день',
      location: 'Приклад: Київ, Поділ'
    }
  }
  if (category === 'Доставка') {
    return {
      title: 'Приклад: Доставка документів по місту',
      description: 'Приклад: доставляю за 1-2 години',
      location: 'Приклад: Львів'
    }
  }
  if (category === 'Цифрові послуги') {
    return {
      title: 'Приклад: Налаштування сайту або реклами',
      description: 'Приклад: створю банер, налаштую сторінку, допоможу з онлайн-сервісом',
      location: 'Приклад: онлайн або Київ'
    }
  }
  return {
    title: 'Приклад: iPhone 13 128GB',
    description: 'Приклад: у хорошому стані, без подряпин',
    location: 'Приклад: Київ'
  }
}

export function validateListingForm(form: ListingFormValues): ListingFormErrors {
  const price = Number(form.price)
  return {
    title: !form.title.trim(),
    description: !form.description.trim(),
    price: !form.price || Number.isNaN(price) || price < 0,
    location: !form.location.trim(),
    category: !form.category.trim()
  }
}

export function hasListingFormErrors(errors: ListingFormErrors) {
  return Object.values(errors).some(Boolean)
}

export function getEmptyCategoryMessage(title: string) {
  return title.toLowerCase().includes('продаж')
    ? 'Користувач ще нічого не продавав.'
    : 'Користувач ще нічого не купував.'
}

