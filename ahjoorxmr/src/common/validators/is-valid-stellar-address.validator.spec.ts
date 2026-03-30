import { validate } from 'class-validator';
import { IsValidStellarAddress } from './is-valid-stellar-address.validator';

class TestDto {
    @IsValidStellarAddress()
    walletAddress: string;
}

describe('IsValidStellarAddress Validator', () => {
    it('should accept valid Stellar public key', async () => {
        const dto = new TestDto();
        dto.walletAddress = 'GBVZM3OSDLSNP5LJJQAYZMJQJIQXQP5PGLLQZXEYQZRTDMZQNM3NLFB';

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
    });

    it('should accept another valid Stellar public key', async () => {
        const dto = new TestDto();
        dto.walletAddress = 'GBUQWP3BOUZX34ULNQG23RQ6F4BVWCIBTICSZ4XNLBDOJLEJDRMARJZ';

        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
    });

    it('should reject invalid checksum', async () => {
        const dto = new TestDto();
        dto.walletAddress = 'GBVZM3OSDLSNP5LJJQAYZMJQJIQXQP5PGLLQZXEYQZRTDMZQNM3NLFX';

        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].constraints?.isValidStellarAddress).toBeDefined();
    });

    it('should reject non-Stellar string', async () => {
        const dto = new TestDto();
        dto.walletAddress = 'not-a-stellar-address';

        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject secret key format', async () => {
        const dto = new TestDto();
        dto.walletAddress = 'SBVZM3OSDLSNP5LJJQAYZMJQJIQXQP5PGLLQZXEYQZRTDMZQNM3NLFB';

        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject empty string', async () => {
        const dto = new TestDto();
        dto.walletAddress = '';

        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject non-string values', async () => {
        const dto = new TestDto();
        (dto.walletAddress as any) = 12345;

        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
    });
});
