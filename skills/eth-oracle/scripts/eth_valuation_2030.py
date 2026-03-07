import argparse

def calculate_scenario(name, revenue_bn, pe_ratio, supply_burn_pct, monetary_premium_bn):
    current_supply = 120.5  # million
    years = 4
    
    # 1. Supply Calculation (Deflation)
    final_supply = current_supply * ((1 - supply_burn_pct/100) ** years)
    
    # 2. Earnings Valuation (DCF / PE)
    market_cap_earnings = revenue_bn * pe_ratio
    
    # 3. Monetary Premium (Store of Value)
    # Total Cap = Earnings Value + Monetary Premium
    total_market_cap = market_cap_earnings + monetary_premium_bn
    
    price = (total_market_cap * 1000) / final_supply # Billion / Million * 1000 = Price
    
    return {
        "scenario": name,
        "revenue_bn": revenue_bn,
        "final_supply_m": round(final_supply, 2),
        "market_cap_t": round(total_market_cap / 1000, 2),
        "price": round(price, 0),
        "multiple": round(price / 1976, 1) # Assuming current price ~1976
    }

def main():
    print(f"{'SCENARIO':<16} {'REVENUE':<10} {'P/E':<5} {'SUPPLY':<8} {'MKT CAP':<10} {'PRICE':<10} {'X-FACTOR'}")
    print("-" * 88)
    
    scenarios = [
        # Bear: 只有目前的水平，甚至略差
        ("Bear (Stagnant)", 10, 15, -0.5, 0), # Inflationary if activity low
        
        # Base: 正常的周期牛市
        ("Base (Cycle)", 50, 25, 0.5, 500), 
        
        # Bull: 支付跑通，Web3 普及
        ("Bull (Adoption)", 150, 30, 1.5, 1000), 
        
        # The 20x Path: AI Agent + Global Settlement + Mania
        ("THE 20x PATH", 300, 40, 2.0, 2500) 
    ]
    
    for s in scenarios:
        res = calculate_scenario(s[0], s[1], s[2], s[3], s[4])
        print(f"{res['scenario']:<16} ${res['revenue_bn']:<9} {s[2]:<5} {res['final_supply_m']:<8} ${res['market_cap_t']:<9}T ${res['price']:<9,.0f} {res['multiple']}x")

    print("\n=== THE 20x PATH DEEP DIVE (Target: ~$40,000/ETH) ===")
    print("To hit 20x, we need a 'Perfect Storm' of three engines:")
    print("1. TECH VALUATION (Gas Fees): $300B Revenue * 40 P/E = $12T")
    print("   - How? 1 Billion AI Agents spending $0.80/day on gas avg.")
    print("2. MONETARY PREMIUM (Store of Value): $2.5T extra")
    print("   - How? ETH becomes the reserve currency for the AI economy (machines hold ETH, not USD).")
    print("3. SUPPLY SHOCK: -2%/year deflation")
    print("   - Result: Supply drops to ~111M, creating a liquidity crisis for buyers.")

if __name__ == "__main__":
    main()
