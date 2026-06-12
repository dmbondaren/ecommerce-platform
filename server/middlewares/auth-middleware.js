const ApiError = require('../exceptions/api-error')
const tokenService = require('../service/token-service')
const userService = require('../service/user-service')

module.exports = async function (req, res, next) {
    try{

        const authorizationHeader = req.headers.authorization;
        if(!authorizationHeader){
            return next(ApiError.UnauthorizedError());
        }
        const accessToken = authorizationHeader.split(' ')[1];
        if(!accessToken){
            return next(ApiError.UnauthorizedError());
        }
        const userData = tokenService.validateAccessToken(accessToken)
        if(!userData){
            return next(ApiError.UnauthorizedError())
        }
        const user = await userService.getUserById(userData.id)
        if (user.bannedPermanent || (user.bannedUntil && new Date(user.bannedUntil).getTime() > Date.now())) {
            return next(ApiError.UnauthorizedError())
        }

        req.user = userData;
        next();
    } catch(e){
        return next(ApiError.UnauthorizedError());
    }
}
