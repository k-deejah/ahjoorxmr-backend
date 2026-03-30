import {
    registerDecorator,
    ValidationOptions,
    ValidatorConstraint,
    ValidatorConstraintInterface,
} from 'class-validator';
import * as StellarSdk from '@stellar/stellar-sdk';

@ValidatorConstraint({ name: 'isValidStellarAddress', async: false })
export class IsValidStellarAddressConstraint
    implements ValidatorConstraintInterface {
    validate(value: any): boolean {
        if (typeof value !== 'string') {
            return false;
        }

        try {
            // Check if it's a valid Ed25519 public key
            return StellarSdk.StrKey.isValidEd25519PublicKey(value);
        } catch {
            return false;
        }
    }

    defaultMessage(): string {
        return 'Invalid Stellar address format. Expected format: G[A-Z2-7]{55} for public keys.';
    }
}

export function IsValidStellarAddress(
    validationOptions?: ValidationOptions,
) {
    return function (target: Object, propertyName: string) {
        registerDecorator({
            target,
            propertyName,
            options: validationOptions,
            constraints: [],
            validator: IsValidStellarAddressConstraint,
        });
    };
}
