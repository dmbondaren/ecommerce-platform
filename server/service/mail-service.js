const nodemailer = require('nodemailer')
const fs = require('fs')
const path = require('path')

class MailService {

    constructor(){
        this.transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT,
            secure: false,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASSWORD
            }
        })
    }

    listingImage(listing, cid){
        const imageUrl = listing.image_url || ''
        if (!imageUrl) return { html: '', attachments: [] }
        const inlineHtml = `<img src="cid:${cid}" alt="${listing.title || 'Оголошення'}" style="width:140px;height:100px;object-fit:cover;border-radius:10px;border:1px solid #d9e2ec">`
        try {
            const fileName = decodeURIComponent(new URL(imageUrl).pathname.split('/').pop() || '')
            const filePath = path.join(__dirname, '..', 'uploads', fileName)
            if (fileName && fs.existsSync(filePath)) return { html: inlineHtml, attachments: [{ filename: fileName, path: filePath, cid }] }
        } catch (e) {}
        return { html: `<img src="${imageUrl}" alt="${listing.title || 'Оголошення'}" style="width:140px;height:100px;object-fit:cover;border-radius:10px;border:1px solid #d9e2ec">`, attachments: [] }
    }

    async sendActivationMail(to, link){
        await this.transporter.sendMail({
            from: process.env.SMTP_USER,
            to,
            subject: `Підтвердження реєстрації ${process.env.API_URL || ''}`,
            text: `Натисніть посилання, щоб активувати акаунт: ${link}`,
            html: `
            <div>
                <h1>Підтвердіть акаунт</h1>
                <a href="${link}">${link}</a>
            </div>
            `
        })
    }

    async sendPasswordResetMail(to, link){
        await this.transporter.sendMail({
            from: process.env.SMTP_USER,
            to,
            subject: `Відновлення пароля ${process.env.API_URL || ''}`,
            text: `Перейдіть за посиланням, щоб змінити пароль: ${link}`,
            html: `
            <div style="font-family:Arial,sans-serif;background:#eef4f7;padding:24px">
              <div style="max-width:520px;margin:auto;background:#fff;border:1px solid #dbe3e7;border-radius:14px;padding:22px">
                <h2 style="margin-top:0;color:#003b3f">Відновлення пароля</h2>
                <p style="color:#334155;line-height:1.5">Натисніть кнопку нижче, відкриється захищена HTML-форма для створення нового пароля.</p>
                <a href="${link}" style="display:inline-block;background:#003b3f;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700">Змінити пароль</a>
                <p style="font-size:12px;color:#64748b;margin-top:18px">Якщо ви не запитували відновлення, просто проігноруйте цей лист.</p>
              </div>
            </div>
            `
        })
    }

    async sendPriceDropMail(to, listing, oldPrice, newPrice){
        const currency = listing.currency || 'UAH'
        const title = listing.title || 'Оголошення'
        const link = `${process.env.CLIENT_URL || 'http://localhost:3000'}/listing/${listing.id || listing._id || ''}`
        await this.transporter.sendMail({
            from: process.env.SMTP_USER,
            to,
            subject: `Ціна знижена: ${title}`,
            text: `Ціну товару "${title}" знижено з ${oldPrice} ${currency} до ${newPrice} ${currency}. ${link}`,
            html: `
            <div style="margin:0;background:#f4f7fb;padding:26px;font-family:Arial,sans-serif;color:#172033">
              <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #d9e2ec;border-radius:16px;overflow:hidden">
                <div style="background:#0f766e;color:#fff;padding:18px 22px">
                  <h2 style="margin:0;font-size:22px">Ціна стала нижчою</h2>
                </div>
                <div style="padding:22px">
                  <h3 style="margin:0 0 10px">${title}</h3>
                  <p style="margin:0 0 16px;color:#526174">Товар з вашого обраного тепер можна купити вигідніше.</p>
                  <div style="display:flex;gap:12px;align-items:center;margin-bottom:18px">
                    <span style="text-decoration:line-through;color:#94a3b8;font-size:18px">${oldPrice} ${currency}</span>
                    <b style="color:#dc2626;font-size:26px">${newPrice} ${currency}</b>
                  </div>
                  <a href="${link}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700">Переглянути оголошення</a>
                </div>
              </div>
            </div>`
        })
    }

    async sendPurchaseBuyerMail(to, buyer, listing){
        if (!to) return
        const currency = listing.currency || 'UAH'
        const title = listing.title || 'Оголошення'
        const seller = listing.seller_nickname || listing.seller_email || 'Продавець'
        const link = `${process.env.CLIENT_URL || 'http://localhost:3000'}/listing/${listing.id || ''}`
        const image = this.listingImage(listing, `purchase-buyer-${listing.id || Date.now()}`)
        await this.transporter.sendMail({
            from: process.env.SMTP_USER,
            to,
            subject: `Дякуємо за покупку: ${title}`,
            text: `Ви купили "${title}" за ${listing.price} ${currency}. Продавець: ${seller}. ${link}`,
            attachments: image.attachments,
            html: `
            <div style="font-family:Arial,sans-serif;background:#f4f7fb;padding:24px;color:#172033">
              <div style="max-width:620px;margin:auto;background:#fff;border:1px solid #d9e2ec;border-radius:16px;overflow:hidden">
                <div style="background:#003b3f;color:#fff;padding:18px 22px"><h2 style="margin:0">Покупку підтверджено</h2></div>
                <div style="padding:22px">
                  ${image.html}
                  <h3>${title}</h3>
                  <p><b>Ціна:</b> ${listing.price} ${currency}</p>
                  <p><b>Продавець:</b> ${seller}</p>
                  <p><b>Електронна пошта продавця:</b> ${listing.seller_email || '-'}</p>
                  <a href="${link}" style="display:inline-block;background:#003b3f;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700">Переглянути товар</a>
                </div>
              </div>
            </div>`
        })
    }

    async sendPurchaseSellerMail(to, buyer, listing){
        if (!to) return
        const currency = listing.currency || 'UAH'
        const title = listing.title || 'Оголошення'
        const buyerName = buyer?.nickname || buyer?.email || 'Покупець'
        const image = this.listingImage(listing, `purchase-seller-${listing.id || Date.now()}`)
        await this.transporter.sendMail({
            from: process.env.SMTP_USER,
            to,
            subject: `Ваш товар купили: ${title}`,
            text: `Товар "${title}" купив ${buyerName} (${buyer?.email || '-'}). Сума: ${listing.price} ${currency}.`,
            attachments: image.attachments,
            html: `
            <div style="font-family:Arial,sans-serif;background:#f4f7fb;padding:24px;color:#172033">
              <div style="max-width:620px;margin:auto;background:#fff;border:1px solid #d9e2ec;border-radius:16px;overflow:hidden">
                <div style="background:#0f766e;color:#fff;padding:18px 22px"><h2 style="margin:0">Ваш товар купили</h2></div>
                <div style="padding:22px">
                  ${image.html}
                  <h3>${title}</h3>
                  <p><b>Сума:</b> ${listing.price} ${currency}</p>
                  <p><b>Покупець:</b> ${buyerName}</p>
                  <p><b>Електронна пошта покупця:</b> ${buyer?.email || '-'}</p>
                  <p><b>Реквізити картки покупця:</b> дані картки не зберігаються сервісом з міркувань безпеки.</p>
                </div>
              </div>
            </div>`
        })
    }
}

module.exports = new MailService()
