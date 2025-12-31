import { betterAuth } from 'better-auth';
// import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin, bearer, jwt, lastLoginMethod, multiSession, openAPI, organization, phoneNumber, username } from 'better-auth/plugins';
// import { PrismaClient } from "@prisma/client";

// const prisma = new PrismaClient();

export const auth = betterAuth({
    emailAndPassword: {
        enabled: true,
    },
    // database: prismaAdapter(prisma, {
    //     provider: "postgresql",
    // })
    plugins: [ 
        openAPI(),
        jwt(),
        lastLoginMethod(),
        multiSession(),
        bearer(),
        admin(),
        organization(),
        username(),
        phoneNumber({
            sendOTP(data, ctx) {
                // TODO: send OTP from here.
                console.log('Send otp data:', data);
            },
        })

    ] 
})