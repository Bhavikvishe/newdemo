from datetime import datetime, timezone

from server.forecasting.ocean_data import OpenMeteoMarineSource


def main():
    source = OpenMeteoMarineSource()

    timestamp = datetime.now(timezone.utc)

    points = [
        ("CENTER", 18.80, 72.70),
        ("EAST", 18.80, 72.80),
        ("WEST", 18.80, 72.60),
        ("NORTH", 18.90, 72.70),
        ("SOUTH", 18.70, 72.70),
    ]

    for name, latitude, longitude in points:
        print("=" * 70)
        print(name)
        print("latitude :", latitude)
        print("longitude:", longitude)

        try:
            sample = source.sample(
                latitude,
                longitude,
                timestamp,
            )

            print("SUCCESS")
            print("uo:", sample.uo_mps)
            print("vo:", sample.vo_mps)
            print("speed:", sample.current_speed_ms)
            print("metadata:", sample.metadata)

        except Exception as exc:
            print("FAILED")
            print(type(exc).__name__)
            print(str(exc))


if __name__ == "__main__":
    main()