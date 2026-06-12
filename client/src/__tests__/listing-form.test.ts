import {
  CATEGORIES,
  SUPPORTED_CURRENCIES,
  getEmptyCategoryMessage,
  getListingCategoryExamples,
  hasListingFormErrors,
  validateListingForm
} from '../utils/listing-form'

describe('listing form validation', () => {
  it('rejects empty required fields', () => {
    const errors = validateListingForm({
      title: '',
      description: '',
      price: '',
      location: '',
      category: ''
    })

    expect(errors).toEqual({
      title: true,
      description: true,
      price: true,
      location: true,
      category: true
    })
    expect(hasListingFormErrors(errors)).toBe(true)
  })

  it('rejects negative and non numeric prices', () => {
    expect(validateListingForm({
      title: 'Ноутбук',
      description: 'Робочий стан',
      price: '-1',
      location: 'Київ',
      category: 'Техніка'
    }).price).toBe(true)

    expect(validateListingForm({
      title: 'Ноутбук',
      description: 'Робочий стан',
      price: 'abc',
      location: 'Київ',
      category: 'Техніка'
    }).price).toBe(true)
  })

  it('accepts a valid listing form', () => {
    const errors = validateListingForm({
      title: 'Ноутбук Lenovo',
      description: '16GB RAM, гарний стан',
      price: '12000',
      location: 'Львів',
      category: 'Техніка'
    })

    expect(hasListingFormErrors(errors)).toBe(false)
  })
})

describe('category examples and profile empty states', () => {
  it('contains the digital services category and currencies used by the UI', () => {
    expect(CATEGORIES).toContain('Цифрові послуги')
    expect(SUPPORTED_CURRENCIES).toEqual(expect.arrayContaining(['UAH', 'USD', 'EUR', 'PLN']))
  })

  it('shows specific examples for digital services', () => {
    const examples = getListingCategoryExamples('Цифрові послуги')

    expect(examples.title).toContain('сайту')
    expect(examples.description).toContain('онлайн-сервісом')
  })

  it('returns clear empty category messages for sales and purchases', () => {
    expect(getEmptyCategoryMessage('Категорії продажів')).toBe('Користувач ще нічого не продавав.')
    expect(getEmptyCategoryMessage('Категорії покупок')).toBe('Користувач ще нічого не купував.')
  })
})
