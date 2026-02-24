declare module "ipaddr.js" {
  export type IPv4Range = string;
  export type IPv6Range = string;

  export interface IPv4Address {
    kind(): "ipv4";
    range(): IPv4Range;
    match(cidr: [IPv4Address, number]): boolean;
    toString(): string;
  }

  export interface IPv6Address {
    kind(): "ipv6";
    range(): IPv6Range;
    match(cidr: [IPv6Address, number]): boolean;
    toString(): string;
    isIPv4MappedAddress(): boolean;
    toIPv4Address(): IPv4Address;
    parts: number[];
  }

  export interface IpaddrStatic {
    IPv4: {
      parse(value: string): IPv4Address;
      isValid(value: string): boolean;
      isValidFourPartDecimal(value: string): boolean;
    };
    IPv6: {
      parse(value: string): IPv6Address;
      isValid(value: string): boolean;
    };
    parse(value: string): IPv4Address | IPv6Address;
    isValid(value: string): boolean;
    parseCIDR(value: string): [IPv4Address | IPv6Address, number];
  }

  const ipaddr: IpaddrStatic;
  export default ipaddr;
}
