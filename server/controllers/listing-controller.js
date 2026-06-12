const listingService = require('../service/listing-service')
function parseExistingImages(value){try{const parsed=JSON.parse(value||'[]');return Array.isArray(parsed)?parsed.filter(Boolean):[]}catch(e){return []}}
class ListingController {
  async getCategories(req,res,next){try{return res.json(await listingService.getCategories())}catch(e){next(e)}}
  async getOne(req,res,next){try{return res.json(await listingService.getById(req.params.id))}catch(e){next(e)}}
  async create(req,res,next){try{const imageUrls=(req.files||[]).map(f=>`${process.env.API_URL||'http://localhost:5000'}/uploads/${f.filename}`);return res.json(await listingService.createListing(req.user.id,{...req.body,currency:req.body.currency||'UAH',imageUrls,imageUrl:imageUrls[0]||req.body.imageUrl||''}))}catch(e){next(e)}}
  async update(req,res,next){try{const uploadedUrls=(req.files||[]).map(f=>`${process.env.API_URL||'http://localhost:5000'}/uploads/${f.filename}`);const existingUrls=parseExistingImages(req.body.existingImageUrls);const imageUrls=[...existingUrls,...uploadedUrls];return res.json(await listingService.updateMyListing(req.user.id,req.params.id,{...req.body,currency:req.body.currency||'UAH',imageUrls,imageUrl:imageUrls[0]||req.body.imageUrl}))}catch(e){next(e)}}
  async remove(req,res,next){try{await listingService.deleteMyListing(req.user.id,req.params.id);return res.json({ok:true})}catch(e){next(e)}}
  async adminRemove(req,res,next){try{return res.json(await listingService.adminDeleteListing(req.user.id, req.params.id, req.body?.titleConfirm || '', req.body?.reason || ''))}catch(e){next(e)}}
  async adminDeactivate(req,res,next){try{return res.json(await listingService.adminSetListingStatus(req.user.id, req.params.id, 'deactivated', req.body?.titleConfirm || '', req.body?.reason || ''))}catch(e){next(e)}}
  async adminActivate(req,res,next){try{return res.json(await listingService.adminSetListingStatus(req.user.id, req.params.id, 'active', req.body?.titleConfirm || '', req.body?.reason || ''))}catch(e){next(e)}}
  async getModerationListings(req,res,next){try{return res.json(await listingService.getModerationListings(req.user.id))}catch(e){next(e)}}
  async getAll(req,res,next){try{return res.json(await listingService.getListings(req.query.search||'', req.query.minPrice, req.query.maxPrice, req.query.category||'', req.query.sortBy||'newest'))}catch(e){next(e)}}
  async getMy(req,res,next){try{return res.json(await listingService.getMyListings(req.user.id))}catch(e){next(e)}}
  async getTopSearches(req,res,next){try{return res.json(await listingService.getTopSearches(req.query.limit||5))}catch(e){next(e)}}
  async addFavorite(req,res,next){try{return res.json(await listingService.addFavorite(req.user.id, req.params.id))}catch(e){next(e)}}
  async addToCart(req,res,next){try{return res.json(await listingService.addToCart(req.user.id, req.params.id))}catch(e){next(e)}}
  async startChat(req,res,next){try{return res.json(await listingService.startChat(req.user.id, req.params.id, req.query.type||'buy'))}catch(e){next(e)}}
  async startSupportChat(req,res,next){try{return res.json(await listingService.startSupportChat(req.user.id, req.body.targetUserId || null))}catch(e){next(e)}}
  async uploadChatAttachment(req,res,next){try{return res.json({ url: req.file ? `${process.env.API_URL||'http://localhost:5000'}/uploads/${req.file.filename}` : '', name: req.file?.originalname || '' })}catch(e){next(e)}}
  async toggleFavorite(req,res,next){try{return res.json(await listingService.toggleFavorite(req.user.id, req.params.id))}catch(e){next(e)}}
  async toggleCart(req,res,next){try{return res.json(await listingService.toggleCart(req.user.id, req.params.id))}catch(e){next(e)}}
  async addView(req,res,next){try{return res.json(await listingService.addView(req.user.id, req.params.id))}catch(e){next(e)}}
  async getHistory(req,res,next){try{return res.json(await listingService.getHistory(req.user.id))}catch(e){next(e)}}
  async getFavorites(req,res,next){try{return res.json(await listingService.getFavorites(req.user.id))}catch(e){next(e)}}
  async getCart(req,res,next){try{return res.json(await listingService.getCart(req.user.id))}catch(e){next(e)}}
  async getChatThreads(req,res,next){try{return res.json(await listingService.getChatThreads(req.user.id, req.query.type || 'buy'))}catch(e){next(e)}}
  async getSupportThreads(req,res,next){try{return res.json(await listingService.getSupportThreads(req.user.id))}catch(e){next(e)}}
  async getChatMessages(req,res,next){try{return res.json(await listingService.getChatMessages(req.user.id, req.query.roomId || ''))}catch(e){next(e)}}
  async markChatRead(req,res,next){try{return res.json(await listingService.markChatRead(req.user.id, req.body.roomId || req.query.roomId || ''))}catch(e){next(e)}}
  async getChatSummary(req,res,next){try{return res.json(await listingService.getChatSummary(req.user.id))}catch(e){next(e)}}
  async editChatMessage(req,res,next){try{return res.json(await listingService.editChatMessage(req.user.id, req.params.id, req.body.text || ''))}catch(e){next(e)}}
  async deleteChatMessage(req,res,next){try{return res.json(await listingService.deleteChatMessage(req.user.id, req.params.id))}catch(e){next(e)}}
  async hideChatThread(req,res,next){try{return res.json(await listingService.hideChatThread(req.user.id, req.body.roomId || req.query.roomId || ''))}catch(e){next(e)}}
  async addReview(req,res,next){try{return res.json(await listingService.addReview(req.user.id, req.body.sellerId, req.body.rating, req.body.comment, req.body.listingId, req.body.pros, req.body.cons, req.body.purchaseId || null))}catch(e){next(e)}}
  async getSellerReviews(req,res,next){try{return res.json(await listingService.getSellerReviews(req.params.sellerId))}catch(e){next(e)}}
  async getMySellerReviews(req,res,next){try{return res.json(await listingService.getSellerReviews(req.params.sellerId, req.user.id))}catch(e){next(e)}}
  async voteReview(req,res,next){try{return res.json(await listingService.voteReview(req.user.id, req.params.id, req.body.voteType || req.body.vote || null))}catch(e){next(e)}}
  async addReviewReply(req,res,next){try{return res.json(await listingService.addReviewReply(req.user.id, req.params.id, req.body.text || req.body.reply || ''))}catch(e){next(e)}}
  async addComplaint(req,res,next){try{const attachments=(req.files||[]).map(f=>({url:`${process.env.API_URL||'http://localhost:5000'}/uploads/${f.filename}`,name:f.originalname||''}));return res.json(await listingService.addComplaint(req.user?.id || null, req.params.id, req.body.message, attachments, req.body.selectionJson || ''))}catch(e){next(e)}}
  async getComplaints(req,res,next){try{return res.json(await listingService.getComplaints(req.user.id))}catch(e){next(e)}}
  async resolveComplaint(req,res,next){try{return res.json(await listingService.resolveComplaint(req.user.id, req.params.id))}catch(e){next(e)}}
  async buy(req,res,next){try{return res.json(await listingService.createPurchase(req.user.id, req.body.listingIds || []))}catch(e){next(e)}}
  async relist(req,res,next){try{return res.json(await listingService.relistMyListing(req.user.id, req.params.id))}catch(e){next(e)}}
  async getPendingReviews(req,res,next){try{return res.json(await listingService.getPendingReviews(req.user.id))}catch(e){next(e)}}
  async getMyReviews(req,res,next){try{return res.json(await listingService.getMyReviews(req.user.id))}catch(e){next(e)}}
  async getPurchases(req,res,next){try{return res.json(await listingService.getMyPurchases(req.user.id))}catch(e){next(e)}}
  async getSales(req,res,next){try{return res.json(await listingService.getMySales(req.user.id))}catch(e){next(e)}}

}
module.exports = new ListingController()
