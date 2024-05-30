import jwt from 'jsonwebtoken';
import dotenv from "dotenv";
dotenv.config();

const validateToken = (req, res, next) => {
    const accessToken = req.header("accessToken");

    if (!accessToken) return res.json({ error: "User not logged in" });

    try {
        const validToken = jwt.verify(accessToken, "process.env.PG_SECRET");
        req.user = validToken;

        return next();
    } catch (err) {
        return res.json({ error: err.message });
    }
};

export { validateToken };
