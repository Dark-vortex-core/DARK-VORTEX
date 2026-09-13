declare module "qrcode-terminal" {
  interface QRCodeOptions {
    small?: boolean;
  }

  function generate(
    input: string,
    options?: QRCodeOptions,
    callback?: (qrcode: string) => void
  ): void;

  const qrcode: {
    generate: typeof generate;
  };

  export default qrcode;
}