import { betterAuth } from 'better-auth';
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin, bearer, jwt, lastLoginMethod, multiSession, openAPI, organization, phoneNumber, username } from 'better-auth/plugins';
import { PrismaService } from './prisma/prisma.service';


export const auth = betterAuth({
    emailAndPassword: {
        enabled: true,
    },
    database: prismaAdapter(PrismaService, {
        provider: "postgresql",
    }),
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